"""Download NASA Black Marble VNP46A4 annual tiles from LAADS DAAC.

Requires a free Earthdata Login account and an app key:
    https://urs.earthdata.nasa.gov/  ->  Generate Token

    export EARTHDATA_TOKEN='eyJ0eXAi...'

Usage:
    .venv/bin/python scripts/darkness/fetch_tiles.py --year 2025

Granule URLs are discovered through NASA's CMR search, which needs no
authentication — only the download itself does. That keeps the script
working when LAADS reorganises its archive paths, which it has done before.

Which tiles to fetch is derived from the actual route and reference-site
geometry (bake_darkness.tiles_needed()) — the same tiles_for() computation
the bake itself uses to decide what to open, not a hand-maintained list
that could silently drift from what a real bake needs. This means a
sibling ../open-pilgrimages checkout must exist, the same requirement
bake_darkness.py already has.

The SHA-256 this prints goes into assets/darkness/meta.json so a later
reader can tell exactly which rasters produced the artifact. The CMR
producer_granule_id for each tile is recorded in data/manifest.json for
the same reason.
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_darkness as BD
import tiles as T

CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json'
COLLECTION = 'C3860065683-LAADS'

# Only these hosts ever see the Earthdata bearer token. Checked before the
# token is attached, not after — a granule URL is data from a remote API
# response, not something to trust by construction.
ALLOWED_DOWNLOAD_HOSTS = frozenset({
    'data.laadsdaac.earthdatacloud.nasa.gov',
    'ladsweb.modaps.eosdis.nasa.gov',
})


def find_granule(year, tile):
    """Ask CMR for this tile's granule and download link. No auth needed for search.

    Refuses when the query matches more than one granule: taking the
    first of an unsorted result set would make it impossible to know
    afterwards which granule actually produced the tile on disk, and a
    second match means the pattern was genuinely ambiguous, not merely
    unordered.
    """
    query = urllib.parse.urlencode({
        'collection_concept_id': COLLECTION,
        'producer_granule_id': 'VNP46A4.A%d001.%s*' % (year, tile),
        'options[producer_granule_id][pattern]': 'true',
        'page_size': 10,
    })
    with urllib.request.urlopen(CMR + '?' + query, timeout=60) as response:
        entries = json.loads(response.read())['feed']['entry']

    if not entries:
        raise SystemExit('no granule found for %d %s' % (year, tile))
    if len(entries) > 1:
        ids = ', '.join(e.get('producer_granule_id', '?') for e in entries)
        raise SystemExit(
            'ambiguous granule match for %d %s: %d granules matched (%s) '
            '— refusing to guess which one is right'
            % (year, tile, len(entries), ids))

    entry = entries[0]
    producer_id = entry.get('producer_granule_id', '?')
    for link in entry.get('links', []):
        href = link.get('href', '')
        if href.endswith('.h5') and href.startswith('http'):
            return href, producer_id
    raise SystemExit('granule %s has no .h5 download link' % producer_id)


def _check_download_url(url):
    """Refuse to attach the bearer token anywhere but a known NASA host.

    The URL comes from a CMR response, not a constant, so it is worth
    checking before the Authorization header is built, not after.
    """
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https':
        raise ValueError('refusing non-https download URL: %r' % url)
    if parsed.hostname not in ALLOWED_DOWNLOAD_HOSTS:
        raise ValueError(
            'refusing download URL with unrecognised host %r; expected one '
            'of %r' % (parsed.hostname, sorted(ALLOWED_DOWNLOAD_HOSTS)))


class _AuthStrippingRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keeps the Earthdata bearer token from leaking off NASA's servers.

    urllib's default redirect handling carries every original request
    header — Authorization included — to wherever the server points next,
    even a different host, even a downgrade from https to http. Any
    redirect that changes host or drops to http gets the token stripped
    instead of silently carrying it along.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req is None:
            return None
        parsed = urllib.parse.urlsplit(newurl)
        same_host = parsed.hostname == urllib.parse.urlsplit(req.full_url).hostname
        if parsed.scheme != 'https' or not same_host:
            new_req.remove_header('Authorization')
        return new_req


def download(url, out_path, token):
    """Stream to a .part file, verify size, then swap into place.

    A crash or truncated connection must never leave a corrupt file at
    out_path — the next run's os.path.exists() check would accept it
    forever, and a self-computed SHA-256 can't distinguish a truncated
    file from a good one; it just hashes whatever arrived.
    """
    _check_download_url(url)
    request = urllib.request.Request(url)
    request.add_header('Authorization', 'Bearer ' + token)
    opener = urllib.request.build_opener(_AuthStrippingRedirectHandler)

    part_path = out_path + '.part'
    try:
        with opener.open(request, timeout=900) as response:
            expected = response.headers.get('Content-Length')
            written = 0
            with open(part_path, 'wb') as handle:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    handle.write(chunk)
                    written += len(chunk)
        if expected is not None and written != int(expected):
            raise IOError(
                'download truncated: got %d bytes, expected %s from %s'
                % (written, expected, url))
    except BaseException:
        if os.path.exists(part_path):
            os.remove(part_path)
        raise
    os.replace(part_path, out_path)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--year', type=int, required=True,
                        help='Black Marble annual composite year to fetch, e.g. 2025')
    args = parser.parse_args()

    token = os.environ.get('EARTHDATA_TOKEN')
    if not token:
        sys.exit('EARTHDATA_TOKEN must be set; generate one at '
                 'https://urs.earthdata.nasa.gov/')

    os.makedirs(T.DATA_DIR, exist_ok=True)

    print('resolving tile set from route and reference-site geometry')
    points, _, _ = BD.load_points()
    tile_ids = sorted(BD.tiles_needed(points))
    print('  needs: %s' % ', '.join(tile_ids))

    manifest = T.read_manifest(T.DATA_DIR)
    for tile in tile_ids:
        out = T.tile_path(T.DATA_DIR, args.year, tile)
        if os.path.exists(out):
            print('have    %s' % os.path.basename(out))
        else:
            url, producer_id = find_granule(args.year, tile)
            download(url, out, token)
            manifest[os.path.basename(out)] = producer_id
            T.write_manifest(T.DATA_DIR, manifest)
            print('fetched %s  (%s)' % (os.path.basename(out), producer_id))
        print('  sha256 %s' % T.sha256_file(out))


if __name__ == '__main__':
    main()
