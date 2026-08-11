"""Download NASA Black Marble VNP46A4 annual tiles from LAADS DAAC.

Requires a free Earthdata Login account and an app key:
    https://urs.earthdata.nasa.gov/  ->  Generate Token

    export EARTHDATA_TOKEN='eyJ0eXAi...'

Usage:
    python3 scripts/darkness/fetch_tiles.py --year 2025

Granule URLs are discovered through NASA's CMR search, which needs no
authentication — only the download itself does. That keeps the script
working when LAADS reorganises its archive paths, which it has done before.

The SHA-256 this prints goes into assets/darkness/meta.json so a later
reader can tell exactly which rasters produced the artifact.
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json'
COLLECTION = 'C3860065683-LAADS'
TILES = ('h17v04', 'h17v05', 'h31v05')
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')


def granule_url(year, tile):
    """Ask CMR for this tile's download URL. No auth needed for search."""
    query = urllib.parse.urlencode({
        'collection_concept_id': COLLECTION,
        'producer_granule_id': 'VNP46A4.A%d001.%s*' % (year, tile),
        'options[producer_granule_id][pattern]': 'true',
        'page_size': 10,
    })
    with urllib.request.urlopen(CMR + '?' + query, timeout=60) as response:
        entries = json.loads(response.read())['feed']['entry']
    for entry in entries:
        for link in entry.get('links', []):
            href = link.get('href', '')
            if href.endswith('.h5') and href.startswith('http'):
                return href
    raise SystemExit('no granule found for %d %s' % (year, tile))


def download(url, out_path, token):
    request = urllib.request.Request(url)
    request.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(request, timeout=900) as response, \
            open(out_path, 'wb') as handle:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            handle.write(chunk)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    args = parser.parse_args()

    token = os.environ.get('EARTHDATA_TOKEN')
    if not token:
        sys.exit('EARTHDATA_TOKEN must be set; generate one at '
                 'https://urs.earthdata.nasa.gov/')

    os.makedirs(DATA_DIR, exist_ok=True)
    for tile in TILES:
        out = os.path.join(DATA_DIR,
                           'VNP46A4.A%d001.%s.h5' % (args.year, tile))
        if os.path.exists(out):
            print('have    %s' % os.path.basename(out))
        else:
            download(granule_url(args.year, tile), out, token)
            print('fetched %s' % os.path.basename(out))
        print('  sha256 %s' % sha256_file(out))


if __name__ == '__main__':
    main()
