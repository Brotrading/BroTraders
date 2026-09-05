"""
Generates data/comparison-rows.json for CompareTopFirms/comparison.html —
one row per (firm, plan, size) combination, read directly from
data/firm-rules.json.

Rewritten 2026-08-19/20. The previous version of this script hardcoded
every single row's price by hand (~200 literal numbers across 9 firms) and
extracted only the restricted-country lists from scripts/comparison.html —
a file that no longer exists on disk, which crashed the whole script before
it ever reached the hardcoded prices. That's also *why* this pipeline went
stale in the first place: keeping 200+ hand-typed numbers in sync with the
real sites by hand doesn't scale. This version has no hardcoded prices at
all — it reads the same firm-rules.json the rest of the site now uses, so
re-running this after any price update (e.g. after propfirm-scraper's daily
check) keeps the comparison page current automatically.

Run: .venv/bin/python scripts/_gen_comparison_json.py
"""
import json
import os

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRM_RULES_PATH = os.path.join(WORKSPACE_ROOT, "data", "firm-rules.json")
OUT_PATH = os.path.join(WORKSPACE_ROOT, "data", "comparison-rows.json")
# Restricted-country lists don't change with pricing — recovered from the
# last successful run of the old pipeline (2026-07-23) rather than
# re-typed, since sanctions/restriction lists are unlikely to have moved.
STALE_OUTPUT_PATH = OUT_PATH

OFAC_RESTRICTED = ["Cuba", "Iran", "North Korea", "Syria", "Russia", "Belarus"]

COUNTRY_VALS = [
    "United States", "United Kingdom", "Netherlands", "Germany", "France", "Spain", "Italy",
    "Belgium", "Sweden", "Norway", "Denmark", "Switzerland", "Austria", "Ireland", "Portugal",
    "Poland", "Canada", "Mexico", "Brazil", "Argentina", "Australia", "New Zealand", "South Africa",
    "Japan", "South Korea", "Singapore", "Hong Kong", "India", "Pakistan", "Indonesia", "Philippines",
    "Vietnam", "Thailand", "Malaysia", "United Arab Emirates", "Saudi Arabia", "Turkey", "Israel",
    "Egypt", "Nigeria", "Kenya", "Cuba", "Iran", "North Korea", "Syria", "Russia", "Belarus",
]

# Fields not present in firm-rules.json (asset paths, and a few gaps in the
# data file — filled from the old script's values, not guessed).
META = {
    "apex_trader_funding": {"logo": "../Photos/firms/apex.png", "firmpage": "../Firms/ApexFunding.html",
                             "country": "USA", "maxaccounts": 20,
                             "platform": "Rithmic, Tradovate, WealthCharts"},
    "tradeify":             {"logo": "../Photos/firms/tradeify.png", "firmpage": "../Firms/TradeifyTrader.html",
                              "country": "USA", "maxaccounts": 5,
                              "platform": "Tradovate, NinjaTrader, Quantower, Rithmic, TradingView, WealthCharts"},
    "myfundedfutures":      {"logo": "../Photos/firms/myfundedfutures.png", "firmpage": "../Firms/MyFundedFuture.html",
                              "country": "USA", "maxaccounts": 5,
                              "platform": "Tradovate, NinjaTrader, Quantower, TradingView, ATAS, Volbook, Volsys, Volumetrica"},
    "lucid_trading":        {"logo": "../Photos/firms/lucid.png", "firmpage": "../Firms/Lucid Trading.html",
                              "country": "USA", "maxaccounts": 5, "platform": None},  # platforms come from firm-rules.json
    "daytraders":           {"logo": "../Photos/firms/daytraders.svg", "firmpage": "../Firms/DayTraders.html",
                              "country": "USA", "maxaccounts": 5, "platform": "Rithmic, TradingView, ONYX"},
    "phidias":               {"logo": "../Photos/firms/phidias.jpeg", "firmpage": "../Firms/PhidiasPropFirm.html",
                               "country": "France", "maxaccounts": 3,
                               "platform": "Tradovate, NinjaTrader, Quantower, TradingView, Rithmic"},
    "nexgen_pro_trader":     {"logo": "../Photos/firms/nexgen.png", "firmpage": "../Firms/NexGen.html",
                               "country": "Cyprus", "maxaccounts": 3, "platform": "ProjectX, Tradovate"},
    "top_one_futures":       {"logo": "../Photos/firms/topone.png", "firmpage": "../Firms/TopOne.html",
                               "country": "USA", "maxaccounts": 3,
                               "platform": "Tradovate, NinjaTrader, TradingView"},
    "fundedseat":            {"logo": "../Photos/firms/fundedseat.png",
                               "firmpage": "https://fundedseat.link/bro",
                               "country": "USA", "maxaccounts": 3,
                               "platform": "Rithmic, DX Feed, Volumetrica, DeepCharts, DeepDom, Quantower, ATAS, MotiveWave, Bookmap, Sierra Chart, Tradesea"},
    # Real logos for these 5, downloaded 2026-08-29 with Mike's explicit go-ahead
    # (favicon/og:image from each firm's own site — see chat for source URLs).
    "takeprofittrader":      {"logo": "../Photos/firms/takeprofittrader.svg",
                               "firmpage": "../Firms/TakeProfitTrader.html",
                               "country": "USA", "maxaccounts": 5,
                               "platform": "Tradovate, NinjaTrader, TradingView, RTrader, Quantower, MotiveWave"},
    "fundednext":            {"logo": "../Photos/firms/fundednext.png",
                               "firmpage": "../Firms/FundedNext.html",
                               "country": "UAE", "maxaccounts": 5,
                               "platform": "Tradovate, NinjaTrader, TradingView"},
    "legendstrading":        {"logo": "../Photos/firms/legendstrading.png",
                               "firmpage": "../Firms/LegendsTrading.html",
                               "country": "USA", "maxaccounts": 5,
                               "platform": "Tradovate, NinjaTrader, Rithmic, Sierra, Quantower"},
    "alpha_futures":         {"logo": "../Photos/firms/alphafutures.png",
                               "firmpage": "../Firms/AlphaFutures.html",
                               "country": "UK", "maxaccounts": 5,
                               "platform": "AlphaTrader, WealthCharts, Quantower, DeepCharts"},
    "iqcapital":             {"logo": "../Photos/firms/iqcapital.svg",
                               "firmpage": "../Firms/IQCapital.html",
                               "country": "Germany", "maxaccounts": 10,
                               "platform": "Quantower, ATAS, DeepCharts"},
    "blusky":                {"logo": "../Photos/firms/blusky.png",
                               "firmpage": "../Firms/BluSky.html",
                               "country": "USA", "maxaccounts": 5,
                               "platform": "Tradovate, NinjaTrader, Rithmic, DeepCharts, Tradesea, Tickblaze, TradingView, Volumetrica"},
}

# One representative size per firm to flag as the homepage/comparison "showcase" row.
SHOWCASE = {
    "apex_trader_funding": ("EOD Trail (Standard)", "50K"),
    "tradeify":             ("Growth", "50K"),
    "myfundedfutures":      ("Rapid", "50K"),
    "lucid_trading":        ("LucidFlex", "50K"),
    "daytraders":           ("Trail", "50K"),
    "phidias":               ("Fundamental", "50K"),
    "nexgen_pro_trader":     ("Evaluation", "100K"),  # no 50K available (see homepage-generator note)
    "top_one_futures":       ("Elite Daily", "50K"),
    "fundedseat":            ("1 Step - Sprint", "50K"),
    "alpha_futures":         ("Zero", "50K"),
}


def eval_price(size):
    """Prefer the BRO/BROTRADING checkout price; Tradeify uses eval_price_dash
    (the DASH-coupon field name, see firm-rules.json's _meta.pricing_note)."""
    for key in ("eval_price_brotrading", "eval_price_dash"):
        if size.get(key) is not None:
            return size[key]
    return size.get("eval_price_msrp")


def main():
    firms = json.load(open(FIRM_RULES_PATH, encoding="utf-8"))["firms"]

    # Recover restricted-country lists from the last successful output
    # rather than re-deriving them — pricing changed, restrictions didn't.
    restricted_countries = {}
    if os.path.exists(STALE_OUTPUT_PATH):
        try:
            restricted_countries = json.load(open(STALE_OUTPUT_PATH, encoding="utf-8")).get("restrictedCountries", {})
        except (json.JSONDecodeError, OSError):
            pass

    rows = []
    skipped = []
    for slug, firm in firms.items():
        meta = META.get(slug)
        if not meta:
            skipped.append(f"{slug}: no META entry, skipped entirely")
            continue
        show_plan, show_size = SHOWCASE.get(slug, (None, None))
        platform = meta["platform"] or ", ".join(firm.get("platforms") or []) or "—"
        country = firm.get("country") or meta["country"]
        maxaccounts = (firm.get("rules_global") or {}).get("max_accounts") or meta["maxaccounts"]
        # "BRO" default only applies when the field is missing entirely (older
        # entries never set it) — an EXPLICIT null (BluSky: code not assigned
        # yet) must not silently become a fake "BRO" code.
        code = firm["code_default"] if "code_default" in firm else "BRO"
        code = code or "TBD"
        website = firm.get("affiliate_url") or meta["firmpage"]

        for plan_name, plan in (firm.get("plans") or {}).items():
            for size_label, size in (plan.get("sizes") or {}).items():
                eval_p = eval_price(size)
                if eval_p is None:
                    skipped.append(f"{slug}/{plan_name}/{size_label}: no price on file, skipped")
                    continue
                activation = size.get("activation_fee") or 0
                msrp = size.get("eval_price_msrp")
                # Per-row discount %, computed fresh rather than copying the
                # firm-level discount_text (that's a marketing sentence, not
                # a value this page's filter/column can parse or display).
                if size.get("discount_pct") is not None:
                    discount = f"{round(size['discount_pct'])}%"
                elif msrp and msrp > 0:
                    discount = f"{round((1 - eval_p / msrp) * 100)}%"
                else:
                    discount = "N/A"
                rows.append({
                    "firm": firm.get("name", slug),
                    "logo": meta["logo"],
                    "account": f"{size_label} {plan_name}",
                    "goal": size.get("profit_target"),
                    "profitTarget": size.get("profit_target"),
                    "ddt": plan.get("drawdown_type"),
                    "dd": size.get("max_drawdown"),
                    "mindays": size.get("min_trading_days") or plan.get("min_days_to_payout") or 0,
                    "eval": eval_p,
                    "activation": activation,
                    "truecost": round(eval_p + activation, 2),
                    "discount": discount,
                    "code": code,
                    "platform": platform,
                    "country": country,
                    "maxaccounts": maxaccounts,
                    "firmpage": meta["firmpage"],
                    "website": website,
                    "showcase": plan_name == show_plan and size_label == show_size,
                })

    output = {
        "ofacRestricted": OFAC_RESTRICTED,
        "countryVals": COUNTRY_VALS,
        "restrictedCountries": restricted_countries,
        "rows": rows,
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    json.dump(output, open(OUT_PATH, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    print(f"Written {len(rows)} rows to {OUT_PATH}")
    if skipped:
        print(f"\n{len(skipped)} skipped:")
        for s in skipped:
            print(f"  - {s}")


if __name__ == "__main__":
    main()
