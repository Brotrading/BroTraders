"""
Extracts comparison table data from comparison.html and writes data/comparison-rows.json.
Run: python _gen_comparison_json.py
"""
import json, re, os, ast

html_path = os.path.join(os.path.dirname(__file__), 'comparison.html')
out_path  = os.path.join(os.path.dirname(__file__), '..', 'data', 'comparison-rows.json')

with open(html_path, encoding='utf-8') as f:
    html = f.read()

def extract_js_array(varname):
    """Extract a JS const array like: const FOO = ["a","b",...];"""
    pattern = rf'const {re.escape(varname)}\s*=\s*(\[[\s\S]*?\]);'
    m = re.search(pattern, html)
    if not m:
        raise ValueError(f'Could not find {varname}')
    raw = m.group(1)
    # Convert JS array to Python: JS and Python array syntax are compatible for string arrays
    return json.loads(raw)

# ---- Static lists ----
ofac_restricted = ["Cuba", "Iran", "North Korea", "Syria", "Russia", "Belarus"]

country_vals = [
    "United States","United Kingdom","Netherlands","Germany","France","Spain","Italy",
    "Belgium","Sweden","Norway","Denmark","Switzerland","Austria","Ireland","Portugal",
    "Poland","Canada","Mexico","Brazil","Argentina","Australia","New Zealand","South Africa",
    "Japan","South Korea","Singapore","Hong Kong","India","Pakistan","Indonesia","Philippines",
    "Vietnam","Thailand","Malaysia","United Arab Emirates","Saudi Arabia","Turkey","Israel",
    "Egypt","Nigeria","Kenya","Cuba","Iran","North Korea","Syria","Russia","Belarus",
]

# ---- Restricted country arrays (extract from HTML) ----
restricted_map_names = {
    "Apex Trader Funding": "RESTRICTED_APEX",
    "Tradeify":            "RESTRICTED_TRADEIFY",
    "Lucid Trading":       "RESTRICTED_LUCID",
    "MyFundedFutures":     "RESTRICTED_MFFU",
    "Top One Futures":     "RESTRICTED_TOPONE",
    "Daytraders.com":      "RESTRICTED_DAYTRADERS",
    "Phidias":             "RESTRICTED_PHIDIAS",
    "NexGen Funding":      "RESTRICTED_NEXGEN",
    "FundedSeat":          "RESTRICTED_FUNDEDSEAT",
}
restricted_countries = {firm: extract_js_array(varname) for firm, varname in restricted_map_names.items()}

# ---- Row data (pre-computed from variant loops) ----
rows = []

def push(row):
    rows.append(row)

# Apex Trader Funding
apex_variants = [
    {"size":"25K Trail",  "goal":1500,"dd":1000,"ddt":"Trailing","eval":19.90,"activation":89, "truecost":109},
    {"size":"50K Trail",  "goal":3000,"dd":2000,"ddt":"Trailing","eval":24.90,"activation":69, "truecost":94},
    {"size":"100K Trail", "goal":6000,"dd":3000,"ddt":"Trailing","eval":39.90,"activation":119,"truecost":159},
    {"size":"150K Trail", "goal":9000,"dd":4000,"ddt":"Trailing","eval":59.90,"activation":139,"truecost":199},
    {"size":"25K EOD",    "goal":1500,"dd":1000,"ddt":"EOD",     "eval":29.90,"activation":109,"truecost":139},
    {"size":"50K EOD",    "goal":3000,"dd":2000,"ddt":"EOD",     "eval":34.90,"activation":119,"truecost":154},
    {"size":"100K EOD",   "goal":6000,"dd":3000,"ddt":"EOD",     "eval":59.90,"activation":139,"truecost":199},
    {"size":"150K EOD",   "goal":9000,"dd":4000,"ddt":"EOD",     "eval":79.90,"activation":159,"truecost":239},
]
showcase_apex = {"50K Trail"}
for v in apex_variants:
    push({"firm":"Apex Trader Funding","logo":"../Photos/firms/apex.png","account":v["size"],
          "goal":v["goal"],"profitTarget":v["goal"],"ddt":v["ddt"],"dd":v["dd"],"mindays":1,
          "eval":v["eval"],"activation":v["activation"],"truecost":v["truecost"],
          "discount":"90%","code":"BRO","platform":"Rithmic, Tradovate, WealthCharts",
          "country":"USA","maxaccounts":20,"firmpage":"../Firms/ApexFunding.html",
          "website":"https://apextraderfunding.com/member/aff/go/buurtie",
          "showcase":v["size"] in showcase_apex})

# Tradeify
tradeify_goals = {"25K":1500,"50K":3000,"100K":4500,"150K":6500}
tradeify_dd    = {"25K":1000,"50K":2000,"100K":3000,"150K":5000}
tradeify_variants = [
    {"plan":"Growth",      "size":"50K", "eval":87.00, "ddt":"EOD","mindays":5},
    {"plan":"Growth",      "size":"150K","eval":221.40,"ddt":"EOD","mindays":5},
    {"plan":"Select Daily","size":"25K", "eval":65.40, "ddt":"EOD","mindays":1},
    {"plan":"Select Daily","size":"50K", "eval":99.00, "ddt":"EOD","mindays":1},
    {"plan":"Select Daily","size":"100K","eval":159.00,"ddt":"EOD","mindays":1},
    {"plan":"Select Flex", "size":"100K","eval":159.00,"ddt":"EOD","mindays":5},
    {"plan":"Select Flex", "size":"150K","eval":221.40,"ddt":"EOD","mindays":5},
    {"plan":"Lightning",   "size":"25K", "eval":207.00,"ddt":"EOD","mindays":5},
    {"plan":"Lightning",   "size":"50K", "eval":295.20,"ddt":"EOD","mindays":5},
    {"plan":"Lightning",   "size":"100K","eval":396.00,"ddt":"EOD","mindays":5},
]
showcase_tradeify = {"50K Growth"}
for v in tradeify_variants:
    acc = f"{v['size']} {v['plan']}"
    sz  = v["size"]
    push({"firm":"Tradeify","logo":"../Photos/firms/tradeify.png","account":acc,
          "goal":tradeify_goals[sz],"profitTarget":tradeify_goals[sz],
          "ddt":v["ddt"],"dd":tradeify_dd[sz],"mindays":v["mindays"],
          "eval":v["eval"],"activation":0,"truecost":v["eval"],
          "discount":"40%","code":"BRO",
          "platform":"Tradovate, NinjaTrader, Quantower, Rithmic, TradingView, WealthCharts",
          "country":"USA","maxaccounts":5,"firmpage":"../Firms/TradeifyTrader.html",
          "website":"https://tradeify.co/?ref=BFYQ2HKM",
          "showcase":acc in showcase_tradeify})

# MyFundedFutures
mffu_goals = {"25K":1500,"50K":3000,"100K":6000,"150K":9000}
mffu_dd    = {"25K":1000,"50K":2000,"100K":3000,"150K":5000}
mffu_variants = [
    {"plan":"Pro",    "size":"50K", "eval":113.50,"ddt":"EOD",     "mindays":14,"discount":"50%"},
    {"plan":"Pro",    "size":"100K","eval":172.00,"ddt":"EOD",     "mindays":14,"discount":"50%"},
    {"plan":"Pro",    "size":"150K","eval":238.50,"ddt":"EOD",     "mindays":14,"discount":"50%"},
    {"plan":"Rapid",  "size":"25K", "eval":87.20, "ddt":"Trailing","mindays":1, "discount":"20%"},
    {"plan":"Rapid",  "size":"50K", "eval":125.60,"ddt":"Trailing","mindays":1, "discount":"20%"},
    {"plan":"Rapid",  "size":"100K","eval":213.60,"ddt":"Trailing","mindays":1, "discount":"20%"},
    {"plan":"Rapid",  "size":"150K","eval":277.60,"ddt":"Trailing","mindays":1, "discount":"20%"},
    {"plan":"Flex",   "size":"25K", "eval":49.00, "ddt":"EOD",     "mindays":5, "discount":"40%"},
    {"plan":"Flex",   "size":"50K", "eval":107.00,"ddt":"EOD",     "mindays":5, "discount":"40%"},
    {"plan":"Builder","size":"50K", "eval":91.80, "ddt":"EOD",     "mindays":2, "discount":"40%"},
]
showcase_mffu = {"50K Rapid"}
for v in mffu_variants:
    acc = f"{v['size']} {v['plan']}"
    sz  = v["size"]
    push({"firm":"MyFundedFutures","logo":"../Photos/firms/myfundedfutures.png","account":acc,
          "goal":mffu_goals[sz],"profitTarget":mffu_goals[sz],
          "ddt":v["ddt"],"dd":mffu_dd[sz],"mindays":v["mindays"],
          "eval":v["eval"],"activation":0,"truecost":v["eval"],
          "discount":v["discount"],"code":"BRO",
          "platform":"Tradovate, NinjaTrader, Quantower, TradingView, ATAS, Volbook, Volsys, Volumetrica",
          "country":"USA","maxaccounts":5,"firmpage":"../Firms/MyFundedFuture.html",
          "website":"https://myfundedfutures.com/challenge?ref=5117",
          "showcase":acc in showcase_mffu})

# Lucid Trading
lucid_goals  = {"25K":1250,"50K":3000,"100K":6000,"150K":9000}
lucid_dd     = {"25K":1000,"50K":2000,"100K":3000,"150K":4500}
lucid_prices = {
    "LucidPro":    {"25K":81, "50K":111,"100K":171,"150K":222},
    "LucidFlex":   {"25K":60, "50K":84, "100K":135,"150K":252},
    "LucidDirect": {"25K":238,"50K":364,"100K":490,"150K":588},
}
lucid_discount = {"LucidPro":"40%","LucidFlex":"40%","LucidDirect":"30%"}
lucid_mindays  = {"LucidPro":3,"LucidFlex":5,"LucidDirect":0}
lucid_accounts = ["25K","50K","100K","150K"]
showcase_lucid = {"50K Flex"}
for plan in ["LucidPro","LucidFlex","LucidDirect"]:
    short = plan.replace("Lucid","")
    for acc in lucid_accounts:
        price = lucid_prices[plan][acc]
        a = f"{acc} {short}"
        push({"firm":"Lucid Trading","logo":"../Photos/firms/lucid.png","account":a,
              "goal":lucid_goals[acc],"profitTarget":lucid_goals[acc],
              "ddt":"EOD","dd":lucid_dd[acc],"mindays":lucid_mindays[plan],
              "eval":price,"activation":0,"truecost":price,
              "discount":lucid_discount[plan],"code":"BROTRADING",
              "platform":"Tradovate, NinjaTrader, Sierra Chart, Quantower, Bookmap, ATAS, MotiveWave, MultiCharts",
              "country":"USA","maxaccounts":5,"firmpage":"../Firms/Lucid Trading.html",
              "website":"https://lucidtrading.com/ref/brotrading/",
              "showcase":a in showcase_lucid})

# Daytraders.com
daytraders_variants = [
    {"size":"25K Trail",     "goal":1500, "dd":1500,"ddt":"Trailing","eval":37.35, "activation":130,"truecost":167.35,"mindays":2},
    {"size":"50K Trail",     "goal":3000, "dd":2500,"ddt":"Trailing","eval":56.85, "activation":130,"truecost":186.85,"mindays":2},
    {"size":"150K Trail",    "goal":8500, "dd":4500,"ddt":"Trailing","eval":104.85,"activation":130,"truecost":234.85,"mindays":2},
    {"size":"300K Trail",    "goal":15000,"dd":7000,"ddt":"Trailing","eval":131.85,"activation":130,"truecost":261.85,"mindays":2},
    {"size":"25K EOD",       "goal":1500, "dd":1000,"ddt":"EOD",     "eval":46.35, "activation":130,"truecost":176.35,"mindays":2},
    {"size":"50K EOD",       "goal":3000, "dd":2000,"ddt":"EOD",     "eval":70.35, "activation":130,"truecost":200.35,"mindays":2},
    {"size":"150K EOD",      "goal":8500, "dd":4000,"ddt":"EOD",     "eval":134.85,"activation":130,"truecost":264.85,"mindays":2},
    {"size":"300K EOD",      "goal":15000,"dd":6500,"ddt":"EOD",     "eval":239.85,"activation":130,"truecost":369.85,"mindays":2},
    {"size":"25K Static",    "goal":2500, "dd":750, "ddt":"Static",  "eval":30.00, "activation":130,"truecost":160.00,"mindays":2},
    {"size":"50K Static",    "goal":3750, "dd":1000,"ddt":"Static",  "eval":40.00, "activation":130,"truecost":170.00,"mindays":2},
    {"size":"100K Static",   "goal":5750, "dd":1500,"ddt":"Static",  "eval":65.00, "activation":130,"truecost":195.00,"mindays":2},
    {"size":"150K Static",   "goal":6750, "dd":1750,"ddt":"Static",  "eval":80.00, "activation":130,"truecost":210.00,"mindays":2},
    {"size":"25K S2F",       "goal":None, "dd":1000,"ddt":"EOD",     "eval":222.00,"activation":0,  "truecost":222.00,"mindays":2},
    {"size":"50K S2F",       "goal":None, "dd":2500,"ddt":"EOD",     "eval":342.00,"activation":0,  "truecost":342.00,"mindays":2},
    {"size":"150K S2F",      "goal":None, "dd":6000,"ddt":"EOD",     "eval":495.00,"activation":0,  "truecost":495.00,"mindays":2},
    {"size":"50K S2L Core",  "goal":3000, "dd":2000,"ddt":"Trailing","eval":229.00,"activation":0,  "truecost":229.00,"mindays":2},
    {"size":"150K S2L Edge", "goal":8500, "dd":4500,"ddt":"Trailing","eval":369.00,"activation":0,  "truecost":369.00,"mindays":2},
    {"size":"300K S2L Ultra","goal":15000,"dd":7000,"ddt":"Trailing","eval":499.00,"activation":0,  "truecost":499.00,"mindays":2},
]
showcase_dt = {"50K Trail"}
for v in daytraders_variants:
    push({"firm":"Daytraders.com","logo":"../Photos/firms/daytraders.svg","account":v["size"],
          "goal":v["goal"],"profitTarget":v["goal"],"ddt":v["ddt"],"dd":v["dd"],"mindays":v["mindays"],
          "eval":v["eval"],"activation":v["activation"],"truecost":v["truecost"],
          "discount":"85%","code":"BROTRADING","platform":"Rithmic, TradingView, ONYX",
          "country":"USA","maxaccounts":5,"firmpage":"../Firms/DayTraders.html",
          "website":"https://daytraders.com/go/brotrading?c=TWCEMMNK",
          "showcase":v["size"] in showcase_dt})

# Phidias
phidias_variants = [
    {"size":"50K Fundamental OTP",     "goal":4000,"dd":2500,"ddt":"EOD","eval":116.00,"activation":0,  "truecost":116.00,"mindays":3},
    {"size":"100K Fundamental OTP",    "goal":6000,"dd":3000,"ddt":"EOD","eval":144.60,"activation":0,  "truecost":144.60,"mindays":3},
    {"size":"150K Fundamental OTP",    "goal":9000,"dd":4500,"ddt":"EOD","eval":172.60,"activation":0,  "truecost":172.60,"mindays":3},
    {"size":"50K Fundamental Monthly", "goal":4000,"dd":2500,"ddt":"EOD","eval":65.60, "activation":149,"truecost":214.60,"mindays":3},
    {"size":"100K Fundamental Monthly","goal":6000,"dd":3000,"ddt":"EOD","eval":109.20,"activation":149,"truecost":258.20,"mindays":3},
    {"size":"150K Fundamental Monthly","goal":9000,"dd":4500,"ddt":"EOD","eval":168.00,"activation":169,"truecost":337.00,"mindays":3},
    {"size":"50K Swing OTP",           "goal":4000,"dd":2500,"ddt":"EOD","eval":144.60,"activation":0,  "truecost":144.60,"mindays":3},
    {"size":"100K Swing OTP",          "goal":6000,"dd":3000,"ddt":"EOD","eval":180.00,"activation":0,  "truecost":180.00,"mindays":3},
    {"size":"150K Swing OTP",          "goal":9000,"dd":4500,"ddt":"EOD","eval":224.60,"activation":0,  "truecost":224.60,"mindays":3},
    {"size":"50K Swing Monthly",       "goal":4000,"dd":2500,"ddt":"EOD","eval":131.60,"activation":149,"truecost":280.60,"mindays":3},
    {"size":"100K Swing Monthly",      "goal":6000,"dd":3000,"ddt":"EOD","eval":164.40,"activation":149,"truecost":313.40,"mindays":3},
]
showcase_phidias = {"50K Fundamental OTP"}
for v in phidias_variants:
    push({"firm":"Phidias","logo":"../Photos/firms/phidias.jpeg","account":v["size"],
          "goal":v["goal"],"profitTarget":v["goal"],"ddt":v["ddt"],"dd":v["dd"],"mindays":v["mindays"],
          "eval":v["eval"],"activation":v["activation"],"truecost":v["truecost"],
          "discount":"80%","code":"BROTRADING",
          "platform":"Tradovate, NinjaTrader, Quantower, TradingView, Rithmic",
          "country":"France","maxaccounts":3,"firmpage":"../Firms/PhidiasPropFirm.html",
          "website":"https://member.phidiaspropfirm.com/aff/go/brotrading",
          "showcase":v["size"] in showcase_phidias})

# NexGen Funding
nexgen_variants = [
    {"size":"5K Standard",   "goal":500,  "dd":500,  "ddt":"Static","eval":41,   "activation":0,"truecost":41,   "mindays":0},
    {"size":"10K Standard",  "goal":1000, "dd":1000, "ddt":"Static","eval":90,   "activation":0,"truecost":90,   "mindays":0},
    {"size":"25K Standard",  "goal":2500, "dd":2500, "ddt":"Static","eval":179,  "activation":0,"truecost":179,  "mindays":0},
    {"size":"50K Standard",  "goal":5000, "dd":5000, "ddt":"Static","eval":329,  "activation":0,"truecost":329,  "mindays":0},
    {"size":"100K Standard", "goal":10000,"dd":10000,"ddt":"Static","eval":529,  "activation":0,"truecost":529,  "mindays":0},
    {"size":"200K Standard", "goal":20000,"dd":20000,"ddt":"Static","eval":1069, "activation":0,"truecost":1069, "mindays":0},
    {"size":"5K Rapid",      "goal":400,  "dd":400,  "ddt":"Static","eval":41,   "activation":0,"truecost":41,   "mindays":0},
    {"size":"10K Rapid",     "goal":800,  "dd":800,  "ddt":"Static","eval":90,   "activation":0,"truecost":90,   "mindays":0},
    {"size":"25K Rapid",     "goal":2000, "dd":2000, "ddt":"Static","eval":179,  "activation":0,"truecost":179,  "mindays":0},
    {"size":"50K Rapid",     "goal":4000, "dd":4000, "ddt":"Static","eval":329,  "activation":0,"truecost":329,  "mindays":0},
    {"size":"100K Rapid",    "goal":8000, "dd":8000, "ddt":"Static","eval":529,  "activation":0,"truecost":529,  "mindays":0},
    {"size":"200K Rapid",    "goal":16000,"dd":16000,"ddt":"Static","eval":1069, "activation":0,"truecost":1069, "mindays":0},
    {"size":"5K Ace",        "goal":500,  "dd":300,  "ddt":"Static","eval":46,   "activation":0,"truecost":46,   "mindays":0},
    {"size":"10K Ace",       "goal":1000, "dd":600,  "ddt":"Static","eval":100,  "activation":0,"truecost":100,  "mindays":0},
    {"size":"25K Ace",       "goal":2500, "dd":1500, "ddt":"Static","eval":204,  "activation":0,"truecost":204,  "mindays":0},
    {"size":"50K Ace",       "goal":5000, "dd":3000, "ddt":"Static","eval":379,  "activation":0,"truecost":379,  "mindays":0},
    {"size":"100K Ace",      "goal":10000,"dd":6000, "ddt":"Static","eval":629,  "activation":0,"truecost":629,  "mindays":0},
    {"size":"200K Ace",      "goal":20000,"dd":12000,"ddt":"Static","eval":1269, "activation":0,"truecost":1269, "mindays":0},
]
showcase_nexgen = {"50K Ace"}
for v in nexgen_variants:
    push({"firm":"NexGen Funding","logo":"../Photos/firms/nexgen.png","account":v["size"],
          "goal":v["goal"],"profitTarget":v["goal"],"ddt":v["ddt"],"dd":v["dd"],"mindays":v["mindays"],
          "eval":v["eval"],"activation":v["activation"],"truecost":v["truecost"],
          "discount":"30%","code":"BRO","platform":"ProjectX, Tradovate",
          "country":"Cyprus","maxaccounts":3,"firmpage":"../Firms/NexGen.html",
          "website":"https://nexgenprotraderfunding.com/?linkId=lp_263534&sourceId=bro&tenantId=protraderfunding",
          "showcase":v["size"] in showcase_nexgen})

# Top One Futures
top_goals = {"25K":1500,"50K":3000,"100K":6000,"150K":9000}
top_dd    = {"25K":1500,"50K":2500,"100K":5000,"150K":7500}
top_variants = [
    {"plan":"Elite",       "size":"25K", "eval":27.60, "ddt":"Static",  "mindays":0, "discount":"60%"},
    {"plan":"Elite Access","size":"25K", "eval":39.00, "ddt":"Static",  "mindays":0, "discount":"Flat"},
    {"plan":"Elite Access","size":"50K", "eval":39.00, "ddt":"Static",  "mindays":0, "discount":"Flat"},
    {"plan":"Elite Access","size":"100K","eval":39.00, "ddt":"Static",  "mindays":0, "discount":"Flat"},
    {"plan":"Instant",     "size":"25K", "eval":167.60,"ddt":"Trailing","mindays":0, "discount":"60%"},
    {"plan":"S2F Sim Pro", "size":"25K", "eval":102.80,"ddt":"Static",  "mindays":10,"discount":"60%"},
    {"plan":"S2F Sim Pro", "size":"50K", "eval":168.40,"ddt":"Static",  "mindays":10,"discount":"60%"},
    {"plan":"S2F Sim Pro", "size":"100K","eval":252.80,"ddt":"Static",  "mindays":10,"discount":"60%"},
    {"plan":"Ignite",      "size":"25K", "eval":87.20, "ddt":"Static",  "mindays":0, "discount":"60%"},
    {"plan":"Ignite",      "size":"150K","eval":319.60,"ddt":"Static",  "mindays":0, "discount":"60%"},
]
showcase_top = {"50K S2F Sim Pro"}
for v in top_variants:
    acc = f"{v['size']} {v['plan']}"
    sz  = v["size"]
    push({"firm":"Top One Futures","logo":"../Photos/firms/topone.png","account":acc,
          "goal":top_goals[sz],"profitTarget":top_goals[sz],
          "ddt":v["ddt"],"dd":top_dd[sz],"mindays":v["mindays"],
          "eval":v["eval"],"activation":0,"truecost":v["eval"],
          "discount":v["discount"],"code":"BRO",
          "platform":"Tradovate, NinjaTrader, TradingView",
          "country":"USA","maxaccounts":3,"firmpage":"../Firms/TopOne.html",
          "website":"https://toponefutures.com/?linkId=lp_707970&sourceId=bro&tenantId=toponefutures",
          "showcase":acc in showcase_top})


# FundedSeat
fundedseat_variants = [
    {"size":"25K Daily 35%", "goal":1500,"dd":1000,"ddt":"EOD","eval":69.95, "activation":0,"truecost":69.95, "mindays":0},
    {"size":"50K Daily 35%", "goal":3000,"dd":2000,"ddt":"EOD","eval":99.95, "activation":0,"truecost":99.95, "mindays":0},
    {"size":"100K Daily 35%","goal":6000,"dd":3000,"ddt":"EOD","eval":169.95,"activation":0,"truecost":169.95,"mindays":0},
    {"size":"150K Daily 35%","goal":9000,"dd":4500,"ddt":"EOD","eval":239.95,"activation":0,"truecost":239.95,"mindays":0},
    {"size":"25K Daily 50%", "goal":1500,"dd":1000,"ddt":"EOD","eval":87.95, "activation":0,"truecost":87.95, "mindays":0},
    {"size":"50K Daily 50%", "goal":3000,"dd":2000,"ddt":"EOD","eval":134.95,"activation":0,"truecost":134.95,"mindays":0},
    {"size":"100K Daily 50%","goal":6000,"dd":3000,"ddt":"EOD","eval":199.95,"activation":0,"truecost":199.95,"mindays":0},
    {"size":"150K Daily 50%","goal":9000,"dd":4500,"ddt":"EOD","eval":289.95,"activation":0,"truecost":289.95,"mindays":0},
    {"size":"25K Daily Pro", "goal":1500,"dd":750, "ddt":"EOD","eval":79.95, "activation":0,"truecost":79.95, "mindays":0},
    {"size":"50K Daily Pro", "goal":3000,"dd":1500,"ddt":"EOD","eval":119.95, "activation":0,"truecost":119.95, "mindays":0},
    {"size":"100K Daily Pro","goal":6000,"dd":2500,"ddt":"EOD","eval":189.95,"activation":0,"truecost":189.95,"mindays":0},
    {"size":"25K Sprint",    "goal":1500,"dd":1000,"ddt":"EOD","eval":74.95, "activation":0,"truecost":74.95, "mindays":0},
    {"size":"50K Sprint",    "goal":3000,"dd":2000,"ddt":"EOD","eval":109.95, "activation":0,"truecost":109.95, "mindays":0},
    {"size":"100K Sprint",   "goal":6000,"dd":3000,"ddt":"EOD","eval":164.95,"activation":0,"truecost":164.95,"mindays":0},
    {"size":"150K Sprint",   "goal":9000,"dd":4500,"ddt":"EOD","eval":259.95,"activation":0,"truecost":259.95,"mindays":0},
    {"size":"25K Direct",    "goal":None,"dd":1000,"ddt":"EOD","eval":199.95,"activation":0,"truecost":199.95,"mindays":0},
    {"size":"50K Direct",    "goal":None,"dd":2000,"ddt":"EOD","eval":299.95,"activation":0,"truecost":299.95,"mindays":0},
    {"size":"100K Direct",   "goal":None,"dd":3000,"ddt":"EOD","eval":449.95,"activation":0,"truecost":449.95,"mindays":0},
    {"size":"25K Bolt",      "goal":None,"dd":1000,"ddt":"EOD","eval":174.95,"activation":0,"truecost":174.95,"mindays":0},
    {"size":"50K Bolt",      "goal":None,"dd":2000,"ddt":"EOD","eval":259.95,"activation":0,"truecost":259.95,"mindays":0},
    {"size":"100K Bolt",     "goal":None,"dd":3000,"ddt":"EOD","eval":374.95,"activation":0,"truecost":374.95,"mindays":0},
]
showcase_fs = {"50K Daily 35%"}
for v in fundedseat_variants:
    push({"firm":"FundedSeat","logo":"../Photos/firms/fundedseat.png","account":v["size"],
          "goal":v["goal"],"profitTarget":v["goal"],"ddt":v["ddt"],"dd":v["dd"],"mindays":v["mindays"],
          "eval":v["eval"],"activation":v["activation"],"truecost":v["truecost"],
          "discount":"50%","code":"BRO",
          "platform":"Rithmic, DX Feed, Volumetrica, DeepCharts, DeepDom, Quantower, ATAS, MotiveWave, Bookmap, Sierra Chart, Tradesea",
          "country":"USA","maxaccounts":3,
          "firmpage":"https://fundedseat.link/bro","website":"https://fundedseat.link/bro",
          "showcase":v["size"] in showcase_fs})

output = {
    "ofacRestricted": ofac_restricted,
    "countryVals":    country_vals,
    "restrictedCountries": restricted_countries,
    "rows": rows,
}

os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"Written {len(rows)} rows to {out_path}")
