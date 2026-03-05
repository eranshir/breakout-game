#!/usr/bin/env python3
"""
Etihad Airways Europe flight scraper.

Collects all direct flights departing from a given airport on a given date
operated by a given airline (default: Etihad / EY) whose destinations fall
within a configurable list of European countries.

Supported API providers
------------------------
  aviation-edge   https://aviation-edge.com          (Future Schedules API)
  aviationstack   https://aviationstack.com           (Flights API)
  airlabs         https://airlabs.co                  (Schedules API)

Usage
-----
  python etihad_flights.py --api-key <KEY> [OPTIONS]

All options have sensible defaults so you only need to supply your API key
(or set the FLIGHT_API_KEY environment variable).
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, date

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: install it with  pip install requests")

# Load .env file if python-dotenv is installed (optional but convenient)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ---------------------------------------------------------------------------
# European countries — ISO 3166-1 alpha-2 codes
# ---------------------------------------------------------------------------
EUROPEAN_COUNTRY_CODES: set[str] = {
    "AL",  # Albania
    "AD",  # Andorra
    "AT",  # Austria
    "BY",  # Belarus
    "BE",  # Belgium
    "BA",  # Bosnia and Herzegovina
    "BG",  # Bulgaria
    "HR",  # Croatia
    "CY",  # Cyprus
    "CZ",  # Czechia
    "DK",  # Denmark
    "EE",  # Estonia
    "FI",  # Finland
    "FR",  # France
    "DE",  # Germany
    "GR",  # Greece
    "HU",  # Hungary
    "IS",  # Iceland
    "IE",  # Ireland
    "IT",  # Italy
    "XK",  # Kosovo
    "LV",  # Latvia
    "LI",  # Liechtenstein
    "LT",  # Lithuania
    "LU",  # Luxembourg
    "MT",  # Malta
    "MD",  # Moldova
    "MC",  # Monaco
    "ME",  # Montenegro
    "NL",  # Netherlands
    "MK",  # North Macedonia
    "NO",  # Norway
    "PL",  # Poland
    "PT",  # Portugal
    "RO",  # Romania
    "RU",  # Russia
    "SM",  # San Marino
    "RS",  # Serbia
    "SK",  # Slovakia
    "SI",  # Slovenia
    "ES",  # Spain
    "SE",  # Sweden
    "CH",  # Switzerland
    "TR",  # Turkey
    "UA",  # Ukraine
    "GB",  # United Kingdom
    "VA",  # Vatican City
}

# Well-known European IATA airport codes used as a supplementary filter when
# country data is absent from the API response.
EUROPEAN_AIRPORT_CODES: set[str] = {
    "LHR", "LGW", "STN", "LTN", "MAN", "EDI", "BHX", "BRS",  # UK
    "CDG", "ORY", "NCE", "LYS", "MRS", "TLS",                  # France
    "FRA", "MUC", "DUS", "HAM", "BER", "STR", "CGN",           # Germany
    "AMS", "EIN",                                                # Netherlands
    "FCO", "MXP", "LIN", "VCE", "NAP", "BGY",                  # Italy
    "MAD", "BCN", "PMI", "AGP", "VLC", "SVQ",                  # Spain
    "ATH", "SKG",                                                # Greece
    "IST", "SAW", "ESB", "ADB",                                 # Turkey
    "ZRH", "GVA", "BSL",                                        # Switzerland
    "VIE",                                                       # Austria
    "BRU",                                                       # Belgium
    "LIS", "OPO",                                                # Portugal
    "CPH",                                                       # Denmark
    "ARN", "GOT",                                                # Sweden
    "OSL",                                                       # Norway
    "HEL",                                                       # Finland
    "DUB",                                                       # Ireland
    "WAW", "KRK",                                                # Poland
    "PRG",                                                       # Czechia
    "BUD",                                                       # Hungary
    "BUH", "OTP",                                                # Romania
    "SOF",                                                       # Bulgaria
    "BEG",                                                       # Serbia
    "ZAG",                                                       # Croatia
    "LJU",                                                       # Slovenia
    "OHD", "SKP",                                                # North Macedonia
    "TGD", "POD",                                                # Montenegro
    "RIX",                                                       # Latvia
    "TLL",                                                       # Estonia
    "VNO",                                                       # Lithuania
    "MSQ",                                                       # Belarus
    "KIV",                                                       # Moldova
    "KBP", "IEV",                                                # Ukraine
    "SVO", "DME", "LED",                                         # Russia
    "GVA", "RKV",                                                # Iceland / Geneva duplicate OK
    "TIA",                                                       # Albania
    "SKP",                                                       # North Macedonia
    "SJJ", "TZL",                                                # Bosnia
    "NIC", "LCA",                                                # Cyprus
    "REK",                                                       # Iceland (alternative)
    "VLL",                                                       # Malta (MLA)
    "MLA",                                                       # Malta
    "LUX",                                                       # Luxembourg
}


# ---------------------------------------------------------------------------
# API adapters
# ---------------------------------------------------------------------------

class AviationEdgeAdapter:
    """
    Aviation Edge — Future Timetable / Departure Schedule API.
    Docs: https://aviation-edge.com/flight-schedule-and-timetable-of-airlines-and-airports/
    Endpoint: GET https://aviation-edge.com/v2/public/timetable
    Required params: key, iataCode, type
    Optional params: airline_iata, dep_iataCode, arr_iataCode, date
    """

    BASE_URL = "https://aviation-edge.com/v2/public/timetable"

    def fetch(self, api_key: str, origin: str, airline_iata: str, flight_date: str) -> list[dict]:
        params = {
            "key": api_key,
            "iataCode": origin,
            "type": "departure",
        }
        # Some Aviation Edge plans support airline_iata and date filtering server-side
        if airline_iata:
            params["airline_iata"] = airline_iata
        if flight_date:
            params["date"] = flight_date

        resp = requests.get(self.BASE_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, dict) and "error" in data:
            raise RuntimeError(f"Aviation Edge API error: {data['error']}")

        return data if isinstance(data, list) else []

    def normalize(self, raw: list[dict], airline_iata: str, flight_date: str) -> list[dict]:
        results = []
        for item in raw:
            # Filter by airline if not already done server-side
            airline = (item.get("airline") or {})
            if airline_iata and airline.get("iataCode", "").upper() != airline_iata.upper():
                continue

            dep = item.get("departure") or {}
            arr = item.get("arrival") or {}
            scheduled_dep = dep.get("scheduledTime", "")

            # Date filter (YYYY-MM-DD prefix match)
            if flight_date and not scheduled_dep.startswith(flight_date):
                continue

            results.append({
                "flight_number": (item.get("flight") or {}).get("iataNumber", ""),
                "airline_iata": airline.get("iataCode", ""),
                "airline_name": airline.get("name", ""),
                "origin_iata": dep.get("iataCode", ""),
                "destination_iata": arr.get("iataCode", ""),
                "destination_country": arr.get("countryCode", ""),
                "destination_city": arr.get("cityCode", ""),
                "scheduled_departure": scheduled_dep,
                "status": item.get("status", ""),
                "aircraft": (item.get("aircraft") or {}).get("iataCode", ""),
            })
        return results


class AviationStackAdapter:
    """
    AviationStack — Flights API.
    Docs: https://aviationstack.com/documentation
    Endpoint: GET https://api.aviationstack.com/v1/flights
    """

    # Free plan only supports HTTP (HTTPS requires a paid plan)
    BASE_URL = "http://api.aviationstack.com/v1/flights"

    def fetch(self, api_key: str, origin: str, airline_iata: str, flight_date: str) -> list[dict]:
        params = {
            "access_key": api_key,
            "dep_iata": origin,
            "airline_iata": airline_iata,
            "flight_date": flight_date,
            "limit": 100,
            "offset": 0,
        }

        all_data: list[dict] = []
        while True:
            resp = requests.get(self.BASE_URL, params=params, timeout=30)
            resp.raise_for_status()
            body = resp.json()

            if "error" in body:
                raise RuntimeError(f"AviationStack error: {body['error'].get('message', body['error'])}")

            page_data = body.get("data", [])
            all_data.extend(page_data)

            pagination = body.get("pagination", {})
            total = pagination.get("total", len(all_data))
            if len(all_data) >= total or not page_data:
                break
            params["offset"] += params["limit"]

        return all_data

    def normalize(self, raw: list[dict], airline_iata: str, flight_date: str) -> list[dict]:
        results = []
        for item in raw:
            dep = item.get("departure") or {}
            arr = item.get("arrival") or {}
            airline = item.get("airline") or {}
            flight = item.get("flight") or {}

            results.append({
                "flight_number": flight.get("iata", ""),
                "airline_iata": airline.get("iata", ""),
                "airline_name": airline.get("name", ""),
                "origin_iata": dep.get("iata", ""),
                "destination_iata": arr.get("iata", ""),
                "destination_country": arr.get("country", ""),
                "destination_city": arr.get("city", ""),
                "scheduled_departure": dep.get("scheduled", ""),
                "status": item.get("flight_status", ""),
                "aircraft": (item.get("aircraft") or {}).get("iata", ""),
            })
        return results


class AirLabsAdapter:
    """
    AirLabs — Schedules API.
    Docs: https://airlabs.co/docs/schedules
    Endpoint: GET https://airlabs.co/api/v9/schedules
    """

    BASE_URL = "https://airlabs.co/api/v9/schedules"

    def fetch(self, api_key: str, origin: str, airline_iata: str, flight_date: str) -> list[dict]:
        params = {
            "api_key": api_key,
            "dep_iata": origin,
            "airline_iata": airline_iata,
        }
        resp = requests.get(self.BASE_URL, params=params, timeout=30)
        resp.raise_for_status()
        body = resp.json()

        if "error" in body:
            raise RuntimeError(f"AirLabs error: {body['error'].get('message', body['error'])}")

        return body.get("response", [])

    def normalize(self, raw: list[dict], airline_iata: str, flight_date: str) -> list[dict]:
        results = []
        for item in raw:
            dep_time = item.get("dep_time", "") or item.get("dep_time_utc", "")

            # AirLabs schedules are not date-filtered; best-effort day-of-week match
            # is handled by the caller if needed. We include all and let the caller filter.
            results.append({
                "flight_number": item.get("flight_iata", ""),
                "airline_iata": item.get("airline_iata", ""),
                "airline_name": item.get("airline_name", "") or item.get("airline_iata", ""),
                "origin_iata": item.get("dep_iata", ""),
                "destination_iata": item.get("arr_iata", ""),
                "destination_country": item.get("arr_country", ""),
                "destination_city": item.get("arr_city", ""),
                "scheduled_departure": dep_time,
                "status": item.get("status", ""),
                "aircraft": item.get("aircraft_icao", ""),
            })
        return results


ADAPTERS = {
    "aviation-edge": AviationEdgeAdapter(),
    "aviationstack": AviationStackAdapter(),
    "airlabs": AirLabsAdapter(),
}


# ---------------------------------------------------------------------------
# European destination filter
# ---------------------------------------------------------------------------

def is_european_destination(
    flight: dict,
    country_codes: set[str],
    airport_codes: set[str],
) -> bool:
    """Return True if the flight's destination is in Europe."""
    country = (flight.get("destination_country") or "").upper()
    dest_iata = (flight.get("destination_iata") or "").upper()

    if country and country in country_codes:
        return True
    if dest_iata and dest_iata in airport_codes:
        return True
    return False


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

DISPLAY_COLUMNS = [
    "flight_number",
    "airline_name",
    "origin_iata",
    "destination_iata",
    "destination_city",
    "destination_country",
    "scheduled_departure",
    "status",
    "aircraft",
]


def output_table(flights: list[dict]) -> None:
    if not flights:
        print("No matching flights found.")
        return

    col_widths = {col: len(col) for col in DISPLAY_COLUMNS}
    for f in flights:
        for col in DISPLAY_COLUMNS:
            col_widths[col] = max(col_widths[col], len(str(f.get(col, ""))))

    header = "  ".join(col.upper().ljust(col_widths[col]) for col in DISPLAY_COLUMNS)
    separator = "  ".join("-" * col_widths[col] for col in DISPLAY_COLUMNS)
    print(header)
    print(separator)
    for f in flights:
        row = "  ".join(str(f.get(col, "")).ljust(col_widths[col]) for col in DISPLAY_COLUMNS)
        print(row)
    print(f"\nTotal: {len(flights)} flight(s)")


def output_json(flights: list[dict], output_file: str | None) -> None:
    text = json.dumps(flights, indent=2, ensure_ascii=False)
    if output_file:
        with open(output_file, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"Saved {len(flights)} flight(s) to {output_file}")
    else:
        print(text)


def output_csv(flights: list[dict], output_file: str | None) -> None:
    dest = output_file or sys.stdout
    if isinstance(dest, str):
        fh = open(dest, "w", newline="", encoding="utf-8")
        close_after = True
    else:
        fh = dest
        close_after = False

    writer = csv.DictWriter(fh, fieldnames=DISPLAY_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(flights)

    if close_after:
        fh.close()
        print(f"Saved {len(flights)} flight(s) to {output_file}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch Etihad direct flights from AUH to Europe on a given date.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # ---- Connection / auth ----
    parser.add_argument(
        "--api-key",
        default=os.environ.get("FLIGHT_API_KEY", ""),
        help="API key for the chosen provider. Can also be set via FLIGHT_API_KEY env var.",
    )
    parser.add_argument(
        "--provider",
        choices=list(ADAPTERS.keys()),
        default="aviation-edge",
        help="Flight data API provider to use.",
    )

    # ---- Flight criteria ----
    parser.add_argument(
        "--origin",
        default="AUH",
        help="IATA code of the departure airport.",
    )
    parser.add_argument(
        "--airline",
        default="EY",
        help="IATA code of the airline to filter by.",
    )
    parser.add_argument(
        "--date",
        default="2026-03-09",
        help="Departure date in YYYY-MM-DD format.",
    )

    # ---- Destination region ----
    parser.add_argument(
        "--region",
        default="europe",
        choices=["europe", "all"],
        help=(
            "'europe' filters results to European destinations only; "
            "'all' returns every destination without geographic filtering."
        ),
    )
    parser.add_argument(
        "--extra-country-codes",
        nargs="*",
        default=[],
        metavar="CC",
        help=(
            "Additional ISO-3166-1 alpha-2 country codes to include as European "
            "(e.g. --extra-country-codes GE AM AZ)."
        ),
    )
    parser.add_argument(
        "--extra-airport-codes",
        nargs="*",
        default=[],
        metavar="IATA",
        help="Additional IATA airport codes to treat as European destinations.",
    )

    # ---- Output ----
    parser.add_argument(
        "--format",
        dest="output_format",
        choices=["table", "json", "csv"],
        default="table",
        help="Output format.",
    )
    parser.add_argument(
        "--output-file",
        default=None,
        help="Path to write output (JSON or CSV). If omitted, prints to stdout.",
    )

    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Validate date
    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        parser.error(f"Invalid date format '{args.date}'. Use YYYY-MM-DD.")

    if not args.api_key:
        parser.error(
            "No API key provided. Use --api-key or set the FLIGHT_API_KEY environment variable."
        )

    # Build effective European sets
    effective_countries = EUROPEAN_COUNTRY_CODES | {c.upper() for c in args.extra_country_codes}
    effective_airports = EUROPEAN_AIRPORT_CODES | {a.upper() for a in args.extra_airport_codes}

    adapter = ADAPTERS[args.provider]

    print(
        f"Fetching {args.airline} departures from {args.origin} on {args.date} "
        f"via {args.provider} ...",
        file=sys.stderr,
    )

    raw = adapter.fetch(args.api_key, args.origin, args.airline, args.date)
    flights = adapter.normalize(raw, args.airline, args.date)

    print(f"  → {len(raw)} raw records received, {len(flights)} after normalization.", file=sys.stderr)

    if args.region == "europe":
        flights = [f for f in flights if is_european_destination(f, effective_countries, effective_airports)]
        print(f"  → {len(flights)} flights to European destinations.", file=sys.stderr)

    # Sort by scheduled departure time
    flights.sort(key=lambda f: f.get("scheduled_departure") or "")

    if args.output_format == "table":
        output_table(flights)
    elif args.output_format == "json":
        output_json(flights, args.output_file)
    elif args.output_format == "csv":
        output_csv(flights, args.output_file)


if __name__ == "__main__":
    main()
