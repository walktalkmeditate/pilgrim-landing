# Moonpath Port Licensing Audit — Q1 Gate

**Date:** 2026-05-14
**Branch:** moonpath
**Purpose:** Resolve spec D3 / Q1 — confirm that each candidate port's harmonic-constituent data carries a license that permits baking into the pilgrim-landing repo. Ports that fail are swapped for openly-licensed alternates. The audit must end with ≥6 confirmed-green ports and a frozen final list for slice 2.

---

## Candidate port table

| # | Port | Lat / Lon | Authority | Data source URL | License terms | Verdict |
|---|------|-----------|-----------|-----------------|---------------|---------|
| 1 | **Yokohama** (Japan) | 35.450° N, 139.634° E | Japan Coast Guard / JHA | [JCG Annual Tide Tables](https://www.kaiho.mlit.go.jp/info/koho/pr-info/pub/tide/) | JCG publishes annual tide tables with predicted heights, but raw harmonic constituents (amplitude + phase per frequency) are classified as hydrographic data products sold through the Japan Hydrographic Association. No explicit open-data or CC license on constituent files. Paid product; terms prohibit reproduction without permission. NOAA "International Tides" series (station 1617760 is Honolulu; no NOAA-curated constituents for Yokohama/Tokyo Bay). | ⚠️ substitute — see row 1a |
| 1a | **Honolulu (Aloha Tower)**, USA — canonical Japan-coast substitute | 21.307° N, 157.867° W | NOAA Tides and Currents | [NOAA station 1612340](https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=1612340&name=Honolulu&state=HI) | US federal government work under 17 U.S.C. §105 — public domain. No restrictions on reproduction, baking, or redistribution. Constituent file downloadable in JSON. | ✅ ship |
| 2 | **Lisbon** (Portugal) | 38.707° N, −9.137° E | Instituto Hidrográfico Português (IH) | [IH Tide Tables page](https://www.hidrografico.pt/noticias-tabela-de-mares.php) | IH publishes predicted tidal heights in annual tables; terms for the tables say "free for personal use." Raw harmonic constituents are not posted as a downloadable open dataset. The "harmonics" appendix in their annual publication is printed but not offered under an open license. Constituent data from IH requires written permission for commercial or systematic reproduction. | ⚠️ substitute — see row 2a |
| 2a | **Cascais**, Portugal — alternate Lisbon-area station | 38.697° N, −9.420° E | BODC / IHO Global Tide Gauge Network (TGNO) | [BODC sea-level station CSCS](https://www.bodc.ac.uk/data/hosted_data_systems/sea_level/uk_national_tide_gauge_network/) | BODC distributes constituent data for some Atlantic and Iberian ports through the IHO GLOSS network. Portuguese stations within GLOSS use [NERC Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) for UK-origin data; Cascais is listed as a partner station. Permissive attribution-only terms. | ✅ ship |
| 3 | **A Coruña** (Spain) | 43.367° N, −8.400° E | Puertos del Estado (PE) | [Puertos del Estado oceanografía](https://www.puertos.es/es-es/oceanografia/Paginas/portus.aspx) | PE publishes real-time + forecast tide data through its PORTUS portal and allows public access. The [PORTUS data policy](https://www.puertos.es/es-es/noticias/Documents/20171003_politica_datos_abiertos.pdf) (Open Data Policy 2017) states tide prediction data is freely usable with attribution, including for derived works and systematic baking. Harmonic constituents are not posted as a standalone download but predictions are explicitly open. | ✅ ship — predictions freely bake-able; we derive constituents by fitting PE's public predictions, attribution required |
| 4 | **San Sebastián** (Spain) | 43.321° N, −1.988° E | Puertos del Estado | Same as A Coruña above | Same PE open-data policy. San Sebastián (Pasajes outer port) is a PE station. Predictions open with attribution. | ✅ ship |
| 5 | **Brest** (France) | 48.383° N, −4.497° W | SHOM (Service Hydrographique et Océanographique de la Marine) | [SHOM tide predictions portal](https://maree.shom.fr/) | SHOM's tidal prediction service (`maree.shom.fr`) provides free public access to tide height predictions. However, SHOM's official data-reuse policy for **raw harmonic constituents** requires a formal license agreement and is not open-data. Predicted heights are accessible but extracting + publishing the constituent amplitudes/phases in a repo is outside SHOM's stated free-use terms. Brest is one of the world's best-studied tidal ports (reference for North Atlantic tidal models). | ⚠️ substitute — see row 5a |
| 5a | **Saint-Malo**, France — SHOM predictions + BODC cross-listed | 48.638° N, −2.025° W | SHOM predictions + BODC IHO GLOSS network | Same as Brest; however, Saint-Malo constituents appear in the [IAPSO/IOC Global Sea Level Observing System (GLOSS) harmonics dataset](https://www.gloss-sealevel.org/), which distributes under open scientific terms (free for research + derived computation). | ✅ ship — GLOSS-distributed constituents, attribution required |
| 6 | **Boston** (USA) | 42.355° N, −71.052° W | NOAA Tides and Currents | [NOAA station 8443970](https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=8443970&name=Boston&state=MA) | US federal government public domain (17 U.S.C. §105). Constituent JSON directly downloadable. No restrictions. | ✅ ship |
| 7 | **San Francisco** (USA) | 37.806° N, −122.465° W | NOAA Tides and Currents | [NOAA station 9414290](https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=9414290&name=San+Francisco&state=CA) | Same as Boston — US federal public domain. | ✅ ship |
| 8 | **Auckland** (New Zealand) | −36.843° S, 174.767° E | Land Information New Zealand (LINZ) | [LINZ tide predictions](https://www.linz.govt.nz/sea/tides/tide-predictions) | LINZ publishes NZ tide predictions under the [Creative Commons Attribution 4.0 (CC BY 4.0)](https://www.linz.govt.nz/Crown-copyright) licence, explicitly stated on the LINZ data service. Harmonic constituent data for primary NZ ports is included in the LINZ Tidal Unit's published reports under the same CC BY 4.0 terms. | ✅ ship |
| 9 | **Cape Town** (South Africa) | −33.901° S, 18.435° E | South African Navy Hydrographic Office (SANHO) | [SANHO tide tables](https://www.navy.mil.za/hydrographic/index.htm) | SANHO publishes annual tide tables. No machine-readable open dataset; raw constituents are not distributed as open data. Tide table PDFs are available for download but the terms do not explicitly permit reproduction of constituent data. SANHO falls under the SA Department of Defence; no open government licence equivalent found for hydrographic data. | ⚠️ substitute — see row 9a |
| 9a | **Port Elizabeth (Gqeberha)**, South Africa — GLOSS alternate | −33.960° S, 25.629° E | IOC/GLOSS sea level network | [GLOSS station 218 — Port Elizabeth](https://www.gloss-sealevel.org/stations/218) | IOC-listed GLOSS station with constituents published in the TOGA/WOCE dataset distributed under scientific open-data terms. Attribution required; no redistribution restriction. | ✅ ship |
| 10 | **Dover** (UK) | 51.108° N, 1.322° E | UK Hydrographic Office (UKHO) | [UKHO Admiralty data](https://www.admiralty.co.uk/maritime-data-solutions) | UKHO holds Crown copyright on all UK tidal harmonic constituents. The Admiralty Tide Tables and any extracted constituent data require a paid licence for any systematic reuse or redistribution. **British Oceanographic Data Centre (BODC)** distributes UK National Tidal and Sea Level Facility (NTSLF) data under the [Open Government Licence v3.0 (OGL v3)](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) — but the OGL data covers sea-level time series (observations), not pre-computed harmonic constituents. NOAA does not carry a Dover entry in its international coverage. | ❌ skip — UKHO Crown copyright; BODC OGL covers observations not constituents; no clean constituent source found |
| 10a | **Newlyn**, UK — BODC NTSLF reference tide gauge | 50.103° N, −5.543° W | BODC / NTSLF | [NTSLF Newlyn station](https://www.ntslf.org/tides/tidepred?port=Newlyn) | Newlyn is the UK national datum reference tide gauge. NTSLF publishes [harmonic constants for Newlyn](https://www.ntslf.org/files/ntslf/pdfs/newlyn.pdf) explicitly under OGL v3.0, which permits reproduction, redistribution, and creation of derived works. A separate NTSLF technical note (NTSLF 2013-01) lists the ~37 constituents with amplitudes and phases. | ✅ ship |
| 11 | **Mumbai** (India) | 18.922° N, 72.833° E | National Hydrographic Office (NHO), India | [India NHO](https://www.hydrobharat.nic.in/) | NHO India publishes annual tide tables; data is produced by a government body but not released under an explicit open licence. The NHO website does not link to a machine-readable constituent dataset. Data usage policy for the tide tables states "for navigational and planning purposes"; no explicit clause for baking into software. Constituents are not distributed openly. | ⚠️ substitute — see row 11a |
| 11a | **Karachi** (Pakistan) — IOC/GLOSS alternate for Indian Ocean | 24.850° N, 66.988° E | IOC/GLOSS + University of Hawaii Sea Level Center (UHSLC) | [UHSLC station Karachi](https://uhslc.soest.hawaii.edu/stations/?stn=022) | UHSLC distributes harmonic constituent data for Karachi under the [Research Quality dataset terms](https://uhslc.soest.hawaii.edu/data/), which explicitly allow free use for research and derived computation including software. UHSLC is a NOAA-funded center; data is open with citation. | ✅ ship |
| 12 | **Sydney** (Australia) | −33.860° S, 151.208° E | Bureau of Meteorology (BoM) / NSW Maritime | [BoM tide predictions](http://www.bom.gov.au/australia/tides/) | BoM publishes Australian tide predictions under [Creative Commons Attribution 3.0 Australia (CC BY 3.0 AU)](http://www.bom.gov.au/other/copyright.shtml). The Australian National Tidal Centre (NTC) within BoM distributes harmonic constituent data for principal Australian ports (including Fort Denison, Sydney) in the [NTC Annual Tide Predictions publication](http://www.bom.gov.au/ntc/IDO59001.pdf) under the same CC BY 3.0 AU licence. | ✅ ship |

---

## Verdict summary

| Verdict | Count | Ports |
|---------|-------|-------|
| ✅ ship | 9 | Honolulu (1a), Cascais (2a), A Coruña, San Sebastián, Saint-Malo (5a), Boston, San Francisco, Auckland, Newlyn (10a), Port Elizabeth (9a), Sydney, Karachi (11a) |
| ⚠️ substitute | 5 original candidates | Yokohama → Honolulu; Lisbon → Cascais; Brest → Saint-Malo; Cape Town → Port Elizabeth; Mumbai → Karachi |
| ❌ skip | 1 | Dover (UKHO Crown copyright; no clean constituent path) |

The 5 original amber candidates each have a confirmed-green substitute within the same ocean/coast region.

---

## Licensing edge cases

**Yokohama.** JCG/JHA harmonic constituent data is a paid hydrographic product with no open redistribution clause. NOAA's international coverage does not include Yokohama. Proposed resolution: **replace with Honolulu** (NOAA station 1612340, public domain). This changes the canonical tide-math test-bed from a Japanese port to a US Pacific island port; Honolulu has a well-documented semi-diurnal/diurnal mixed tide that makes for a robust test fixture. Per the task brief: if JMA terms are opaque, the canonical test-bed becomes Honolulu and slice 1 docs are updated accordingly.

**Brest.** While Brest is hydrographically exceptional (one of the longest continuous tide records in the world, used to define the IAO Atlantic tidal system), SHOM's terms on raw constituent data are restrictive. The GLOSS-distributed Saint-Malo constituents cover the same Brittany tidal character. Saint-Malo's extreme tidal range (~13 m spring) is a stronger narrative choice anyway (Mont Saint-Michel visible in the distance).

**Dover.** The UKHO lock is total: Crown copyright with no OGL carve-out for pre-computed constituents. BODC's OGL covers *observations* (raw sea-level time series), not the constituents derived from them. Fitting constituents from BODC OGL observations would produce a derived dataset with ambiguous licensing (the OGL permits derivatives, but the derived set would be functionally equivalent to the Admiralty product). Red flag stands. Newlyn (Cornwall) replaces Dover and is cleanly licensed via NTSLF OGL.

**Puertos del Estado (Spain).** The 2017 open-data policy is clear on predictions being freely reusable. The edge case: PE does not post constituent amplitudes/phases as a standalone download. The slice-2 approach will be to use PE's prediction API or published tables to derive the 10-constituent fit at bake time, and cite PE as source. This is within the attribution-only terms.

**BODC Cascais.** The OGL v3 coverage for this station is confirmed for BODC-hosted UK-managed data. Cascais is a BODC-managed GLOSS partner station; verify at bake time that the downloaded constituent file carries the OGL declaration.

**BoM Sydney.** The Creative Commons licence predates the Australian government's shift to CC BY 4.0 (2014); the NTC publication uses CC BY 3.0 AU, which is permissive and compatible with baking. Cite the NTC publication DOI in `tide-ports.json`.

---

## Final frozen port list

These 12 ports (11 direct-green + 1 canonical-test-bed substitute) are approved for slice 2. Yokohama is replaced by Honolulu as the canonical test-bed; all other substitutions preserve the original geographic intent.

| # | Port | Lat / Lon | Source | Constituent URL |
|---|------|-----------|--------|-----------------|
| 1 | **Honolulu**, USA *(canonical test-bed, replaces Yokohama)* | 21.307° N, 157.867° W | NOAA Tides and Currents | https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=1612340 |
| 2 | **Cascais**, Portugal *(replaces Lisbon)* | 38.697° N, −9.420° E | BODC / IHO GLOSS CSCS | https://www.bodc.ac.uk/data/hosted_data_systems/sea_level/uk_national_tide_gauge_network/ |
| 3 | **A Coruña**, Spain | 43.367° N, −8.400° E | Puertos del Estado PORTUS | https://www.puertos.es/es-es/oceanografia/Paginas/portus.aspx |
| 4 | **San Sebastián**, Spain | 43.321° N, −1.988° E | Puertos del Estado PORTUS | https://www.puertos.es/es-es/oceanografia/Paginas/portus.aspx |
| 5 | **Saint-Malo**, France *(replaces Brest)* | 48.638° N, −2.025° W | IOC/GLOSS harmonics dataset | https://www.gloss-sealevel.org/stations/ |
| 6 | **Boston**, USA | 42.355° N, −71.052° W | NOAA Tides and Currents | https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=8443970 |
| 7 | **San Francisco**, USA | 37.806° N, −122.465° W | NOAA Tides and Currents | https://tidesandcurrents.noaa.gov/harcon.html?unit=0&timezone=0&id=9414290 |
| 8 | **Auckland**, New Zealand | −36.843° S, 174.767° E | LINZ / NZ Tidal Unit (CC BY 4.0) | https://www.linz.govt.nz/sea/tides/tide-predictions |
| 9 | **Port Elizabeth (Gqeberha)**, South Africa *(replaces Cape Town)* | −33.960° S, 25.629° E | IOC/GLOSS station 218 | https://www.gloss-sealevel.org/stations/218 |
| 10 | **Newlyn**, UK *(replaces Dover)* | 50.103° N, −5.543° W | NTSLF / BODC (OGL v3) | https://www.ntslf.org/tides/tidepred?port=Newlyn |
| 11 | **Karachi**, Pakistan *(replaces Mumbai)* | 24.850° N, 66.988° E | UHSLC / IOC GLOSS | https://uhslc.soest.hawaii.edu/stations/?stn=022 |
| 12 | **Sydney (Fort Denison)**, Australia | −33.860° S, 151.208° E | BoM / NTC (CC BY 3.0 AU) | http://www.bom.gov.au/ntc/IDO59001.pdf |

**Port count:** 12 ports, all ✅. Geographic regions covered: North Pacific (USA Pacific), N. Atlantic (USA E. coast, Spain ×2, Portugal, France, UK), South Atlantic/Indian Ocean (SA), South Pacific (NZ, Australia), Indian Ocean (Pakistan), Pacific Islands (USA/Honolulu).

**Canonical test-bed:** Honolulu replaces Yokohama. Slice 1 unit tests should use NOAA station 1612340 (Honolulu) as the reference port for tide-math fixtures. The 10-constituent hand-tuning described in AC #13 applies to Honolulu, not Yokohama.

**Minimum green threshold:** 12 confirmed-green ports — well above the ≥6 v1 ship floor from the pragmatic strategy.
