#!/usr/bin/env python3
"""
Cost analysis across brands/styles. Input: JSON written by scripts/extract-costing-data.ts. Output: one Excel workbook.

    npx tsx scripts/extract-costing-data.ts <dir with the reference files> data.json
    python3 scripts/analysis/build_cost_analysis.py data.json cost_analysis.xlsx

"Brand family" is derived from the product-ID evidence in the files (see README sheet); every number is computed from the
sheets themselves (engine recomputation of the actual sheets, the client sheets as typed, the YOUSTA cost summary).
"""
import json, re, sys
import numpy as np
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

src, out = sys.argv[1], sys.argv[2]
D = json.load(open(src))
A, C, SUM = D["actual"], D["client"], D["summary"]

# ─────────────────────────── dataset ───────────────────────────
seen, AU = set(), []
for a in A:  # the same 5 YOUSTA sheets appear in both actual workbooks
    if a["sheet"] in seen:
        continue
    seen.add(a["sheet"]); AU.append(a)

def family(a):
    t = a["title"].upper()
    if "KRTS" in t:
        return "KRTS (GET/YET)"
    if a["file"].endswith("_2.xlsx") and re.match(r"^[456]\d{3}", a["style"]):
        return "KRTS (GET/YET)"
    return "YOUSTA"

def series(a):
    m = re.search(r"KRTS(FUT|CUT)", a["title"].upper())
    if m:
        return m.group(1)
    if a["file"].endswith("_2.xlsx") and re.match(r"^6\d{3}", a["style"]):
        return "FUT (6xxx)"
    return ""

def ftype(name):
    n = name.lower()
    if "schiffli" in n: return "Cotton slub (schiffli)"
    if "slub" in n and "rayon" in n: return "Rayon slub"
    if "slub" in n: return "Cotton slub"
    if "flex" in n: return "Cotton flex"
    if re.search(r"poly\s*cotton", n): return "Poly cotton"
    if re.search(r"40\s*x\s*30|cotton", n): return "Cotton 40x30"
    if "rayon" in n: return "Rayon"
    if re.search(r"pst|gadhwal", n): return "PST / Gadhwal"
    return "Other"

def grp(a, g):
    return sum(l["total"] for l in a["lines"] if l["group"] == g)

def fabric_metrics(a):
    ls = [l for l in a["lines"] if l["section"] == "FABRIC_ORDER" and l["group"] == "Fabric" and (l["qty"] or 0) > 0 and (l["rate"] or 0) > 0
          and not re.search(r"yoke\s*\+?\s*sleeve", l["item"], re.I)]
    greige = [l for l in ls if re.search("greige", l["item"], re.I)]
    proc = [l for l in ls if re.search("finish", l["item"], re.I) and greige]
    base = greige if greige else [l for l in ls if l not in proc]
    moved = 0.0
    if not base and a["sheet"] == "6100":  # its main fabric is labelled "Pst foil print all over" (classed as embellishment by name)
        base = [l for l in a["lines"] if l["section"] == "FABRIC_ORDER" and re.search("foil print", l["item"], re.I)]
        moved = sum(l["qty"] * l["rate"] for l in base)
    m = sum(l["qty"] for l in base)
    val = sum(l["qty"] * l["rate"] for l in base)
    pval = sum(l["qty"] * l["rate"] for l in proc)
    return dict(fab_m=m, fab_val=val, proc_val=pval, base_rate=(val / m if m else None), landed_rate=((val + pval) / m if m else None),
                ftype=" + ".join(sorted({ftype(l["item"]) for l in base})) or None, fab_lines="; ".join(f'{l["item"].strip()} {l["qty"]:g}@{l["rate"]:g}' for l in base + proc), moved=moved)

def note_num(s):
    m = re.search(r"(\d[\d,]*\.?\d*)", s)
    return float(m.group(1).replace(",", "")) if m else None

def production(a):
    d = {}
    for t in a["notes"]:
        tl, v = t.lower(), note_num(t)
        if v is None: continue
        if (("rec" in tl) and "mtr" in tl) or "mtr received" in tl: d["received_m"] = v
        elif "used" in tl and "mtr" in tl: d["used_m"] = v
        elif re.search(r"\bcut\b|pcs cut|cut qnty", tl): d["cut_pcs"] = v
        elif "ship" in tl: d["ship_pcs"] = v
        elif "shortage" in tl: d["shortage_pcs"] = v
        elif "fent" in tl: d["fent_m"] = v
    return d

rows = []
for a in AU:
    r, d = a["r"], a["dispatchPcs"] or 0
    row = dict(sheet=a["sheet"], title=a["title"], style=a["style"], colour=a["colour"], family=family(a), series=series(a), workbook=a["file"],
               order_pcs=a["orderPcs"], dispatch_pcs=d, sale_rate=a["saleRate"], consumption_cell=a["consumption"], total_cost=r["totalCost"], cost_per_pc=r["costPerPc"],
               profit_pct=r["profitPct"], per_pc_profit=r["perPcProfit"], fabric_group_cost=r["totalFabricCost"], cmt_total=r["cmtTotal"], trims_total=r["totalTrimsCost"],
               value_loss=r["totalValueLoss"], notes=" | ".join(a["notes"]))
    for g in ["Fabric", "Embellishment", "Trims", "Labels & Tags", "Packaging", "Other"]:
        row["g_" + g] = grp(a, g)
    row.update(fabric_metrics(a)); row.update(production(a))
    rows.append(row)
df = pd.DataFrame(rows)
for c in ["received_m", "used_m", "cut_pcs", "ship_pcs", "shortage_pcs", "fent_m"]:
    if c not in df: df[c] = np.nan
# the 6100 foil-printed main fabric is fabric, not embellishment
i = df.moved > 0
df.loc[i, "g_Fabric"] += df.loc[i, "moved"]; df.loc[i, "g_Embellishment"] -= df.loc[i, "moved"]
df["fill_rate"] = df.dispatch_pcs / df.order_pcs
df["sale_value"] = df.dispatch_pcs * df.sale_rate
df["cluster"] = np.where(df.consumption_cell.fillna(df.fab_m / df.dispatch_pcs) >= 2.2, "Set / long (≥2.2 m)", "Kurta / top")
df["m_per_dispatched_pc"] = df.fab_m / df.dispatch_pcs
df["purchase_vs_cell_pct"] = (df.m_per_dispatched_pc / df.consumption_cell - 1) * 100
df["fabric_pc"] = (df.g_Fabric) / df.dispatch_pcs
df["emb_pc"] = df.g_Embellishment / df.dispatch_pcs
df["addon_trims_pc"] = df.g_Trims / df.dispatch_pcs
df["cmt_pc"] = df.cmt_total / df.dispatch_pcs
df["trims_pc"] = (df["g_Labels & Tags"] + df["g_Packaging"] + df["g_Other"]) / df.dispatch_pcs
df["value_loss_pct_of_cost"] = df.value_loss / df.total_cost * 100
df["used_per_cut"] = df.used_m / df.cut_pcs
df["received_per_cut"] = df.received_m / df.cut_pcs
df["ordered_vs_received_pct"] = (df.fab_m - df.received_m) / df.fab_m * 100
df["segment"] = np.where(df.family == "YOUSTA", "YOUSTA", np.where(df.series == "CUT", "KRTS 5xxx (CUT)", "KRTS 4xxx/6xxx (FUT)"))
df["embellished"] = np.where(df.emb_pc > 0.5, "embellished", "plain")
df = df.sort_values(["family", "segment", "style"]).reset_index(drop=True)

def wavg(x, col):
    return x[col].sum() / x.dispatch_pcs.sum()

# ─────────────────────────── tables ───────────────────────────
def seg_table(by):
    out = []
    for key, x in df.groupby(by):
        d = x.dispatch_pcs.sum()
        out.append(dict(**({by: key} if isinstance(by, str) else dict(zip(by, key))), sheets=len(x), pieces_dispatched=d, sale_value=x.sale_value.sum(),
            avg_sale_rate=x.sale_value.sum() / d, avg_cost_per_pc=x.total_cost.sum() / d, profit_pct_weighted=(x.sale_value.sum() - x.total_cost.sum()) / x.sale_value.sum() * 100,
            fabric_pc=x.g_Fabric.sum() / d, embellishment_pc=x.g_Embellishment.sum() / d, addon_trims_pc=x.g_Trims.sum() / d, cmt_pc=x.cmt_total.sum() / d,
            labels_pc=x["g_Labels & Tags"].sum() / d, packaging_pc=x.g_Packaging.sum() / d, other_pc=x.g_Other.sum() / d, value_loss_pc=x.value_loss.sum() / d, dispatch_vs_order=d / x.order_pcs.sum()))
    return pd.DataFrame(out)
T_family = seg_table("family")
T_seg = seg_table("segment")
T_cl = seg_table(["family", "cluster"])

k = df[df.cluster == "Kurta / top"]
std = k.groupby(["segment", "embellished"]).agg(sheets=("sheet", "count"), pieces=("dispatch_pcs", "sum"), sale_rate_median=("sale_rate", "median"), fabric_pc=("fabric_pc", "median"),
    embellishment_pc=("emb_pc", "median"), addon_trims_pc=("addon_trims_pc", "median"), cmt_pc=("cmt_pc", "median"), labels_packaging_other_pc=("trims_pc", "median"),
    cost_per_pc=("cost_per_pc", "median"), cost_min=("cost_per_pc", "min"), cost_max=("cost_per_pc", "max"), profit_pct=("profit_pct", "median")).reset_index()

fab_rate = df.dropna(subset=["landed_rate"]).groupby("ftype").agg(sheets=("sheet", "count"), landed_rate_min=("landed_rate", "min"), landed_rate_median=("landed_rate", "median"),
    landed_rate_max=("landed_rate", "max"), fabric_cost_pc_median=("fabric_pc", "median")).reset_index().sort_values("sheets", ascending=False)
fab_rate_family = df.dropna(subset=["landed_rate"]).groupby(["family", "ftype"]).agg(sheets=("sheet", "count"), landed_rate_median=("landed_rate", "median"),
    min=("landed_rate", "min"), max=("landed_rate", "max")).reset_index()

cons_fam = k.groupby("family").agg(sheets=("sheet", "count"), cell_median=("consumption_cell", "median"), cell_min=("consumption_cell", "min"), cell_max=("consumption_cell", "max"),
    purchased_m_per_pc_median=("m_per_dispatched_pc", "median"), purchased_min=("m_per_dispatched_pc", "min"), purchased_max=("m_per_dispatched_pc", "max"),
    allowance_pct_median=("purchase_vs_cell_pct", "median")).reset_index()
cons_type = k.groupby("ftype").agg(sheets=("sheet", "count"), cell_median=("consumption_cell", "median"), purchased_m_per_pc_median=("m_per_dispatched_pc", "median"),
    landed_rate_median=("landed_rate", "median"), fabric_cost_pc_median=("fabric_pc", "median")).reset_index()

# trims rate card
tl = []
for a in AU:
    d = a["dispatchPcs"] or 1
    for l in a["lines"]:
        if l["section"] == "TRIMS" and l["item"].strip() and (l["qty"] or 0) > 0 and (l["rate"] or 0) > 0:
            tl.append(dict(sheet=a["sheet"], family=family(a), item={"frieght": "freight"}.get(l["item"].strip().lower(), l["item"].strip().lower()), qty=l["qty"], rate=l["rate"], cost_pc=l["total"] / d, qty_pc=l["qty"] / d, dispatch=d))
TL = pd.DataFrame(tl)
trims = TL.groupby(["item", "family"]).agg(sheets=("sheet", "count"), rate_min=("rate", "min"), rate_median=("rate", "median"), rate_max=("rate", "max"), qty_per_pc=("qty_pc", "median"), cost_per_pc=("cost_pc", "median")).reset_index()
cart = TL[TL.item == "carton"].assign(pcs_per_carton=lambda x: x.dispatch / x.qty).groupby("family").pcs_per_carton.agg(["count", "median", "min", "max"]).reset_index()

# embellishment / add-ons
def kind(x):
    n = x.lower()
    for pat, kk in [("tass", "Tassels"), (r"lace|dori", "Lace / dori"), ("foil", "Foil print"), ("couching", "Couching emb"), ("katha", "Katha work"), ("palla", "Palla emb"), ("yoke", "Yoke emb"),
                    (r"neck.*sle|sle.*neck", "Neck & sleeve emb"), ("neck", "Neck emb"), ("sle", "Sleeve emb"), ("front", "Front emb"), ("hand", "Hand work"), ("scallop", "Scallop"),
                    ("button", "Button"), ("zipper", "Zipper"), ("elastic", "Elastic"), ("emb", "Embroidery (unspecified)")]:
        if re.search(pat, n): return kk
    return "Other"
el = []
for a in AU:
    d = a["dispatchPcs"] or 1
    for l in a["lines"]:
        if l["section"] == "FABRIC_ORDER" and l["group"] in ("Embellishment", "Trims") and (l["qty"] or 0) > 0 and (l["rate"] or 0) > 0 and not (a["sheet"] == "6100" and "foil" in l["item"].lower()):
            el.append(dict(sheet=a["sheet"], family=family(a), kind=kind(l["item"]), item=l["item"].strip(), qty=l["qty"], rate=l["rate"], cost_pc=l["total"] / d))
EL = pd.DataFrame(el)
emb = EL.groupby("kind").agg(lines=("sheet", "count"), rate_min=("rate", "min"), rate_median=("rate", "median"), rate_max=("rate", "max"), cost_pc_median=("cost_pc", "median"), cost_pc_max=("cost_pc", "max")).reset_index().sort_values("lines", ascending=False)
emb_fam = df.groupby("family").agg(sheets=("sheet", "count"), with_embellishment=("emb_pc", lambda s: int((s > 0.5).sum())), emb_pc_median_when_present=("emb_pc", lambda s: s[s > 0.5].median())).reset_index()

# CMT: per piece (a sheet can bill CMT on more than one line) and the billed-vs-dispatched quantity
cm_qty = {}
for a in AU:
    q = sum(l["qty"] for l in a["lines"] if l["section"] == "CMT" and (l["qty"] or 0) > 0)
    n = len([l for l in a["lines"] if l["section"] == "CMT" and (l["qty"] or 0) > 0])
    cm_qty[a["sheet"]] = (q, n)
df["cmt_lines"] = df.sheet.map(lambda s_: cm_qty[s_][1])
cmt = df.groupby(["segment", "cluster"]).agg(sheets=("sheet", "count"), cmt_pc_min=("cmt_pc", "min"), cmt_pc_median=("cmt_pc", "median"), cmt_pc_max=("cmt_pc", "max"),
    cmt_pc_weighted=("cmt_total", "sum")).reset_index()
cmt["cmt_pc_weighted"] = [df[(df.segment == r.segment) & (df.cluster == r.cluster)].cmt_total.sum() / df[(df.segment == r.segment) & (df.cluster == r.cluster)].dispatch_pcs.sum() for r in cmt.itertuples()]
cmt_mode = df.cmt_pc.round(2).value_counts().head(8).rename_axis("cmt_per_pc").reset_index(name="sheets")

# margins / price
margin = df[["sheet", "colour", "family", "segment", "cluster", "order_pcs", "dispatch_pcs", "sale_rate", "cost_per_pc", "per_pc_profit", "profit_pct", "value_loss", "value_loss_pct_of_cost", "fill_rate"]].copy()
sale_tiers = df.groupby(["family", "segment"]).sale_rate.agg(["count", "min", "median", "max"]).reset_index()

S = pd.DataFrame(SUM)
S["style"] = S.styleNo.str.extract(r"(\d{4,5})(?:/\d+)?$")[0]
S.loc[S.styleNo.str.contains("2220"), "style"] = "2220"
S["po_value"] = S.poQty * S.poCost
S["billed_value"] = S.dispatched * S.poCost
S["actual_cost_value"] = S.dispatched * S.actualCost
S["margin_per_pc"] = S.poCost - S.actualCost
S["margin_pct"] = S.margin_per_pc / S.poCost * 100
S = S.merge(df[["style", "sheet", "cost_per_pc", "sale_rate", "consumption_cell", "m_per_dispatched_pc"]].drop_duplicates("style"), on="style", how="left")
S["actual_sheet_minus_summary"] = S.cost_per_pc - S.actualCost
S["po_cost_minus_actual_sheet_rate"] = S.poCost - S.sale_rate

# colourways
colour = df[df.sheet.str.match(r"^500[89]")][["sheet", "colour", "order_pcs", "dispatch_pcs", "fill_rate", "consumption_cell", "m_per_dispatched_pc", "used_per_cut", "received_per_cut", "landed_rate", "fabric_pc", "emb_pc", "cmt_pc", "trims_pc", "cost_per_pc", "profit_pct", "value_loss", "notes"]]

# client sheets
cr = []
for c in C:
    sec = {x["key"]: x["total"] for x in c["sections"]}
    main = next((l for l in c["lines"] if l["item"] == "Main Fabric"), {})
    rej = next((l for l in c["lines"] if l["section"] == "garment_rejection"), {})
    oh = next((l for l in c["lines"] if l["section"] == "overhead_margin"), {})
    cmm = next((l for l in c["lines"] if l["section"] == "cm"), {})
    cr.append(dict(file=c["file"], layout=c["layout"], product_id=c["productId"], style=c["style"], main_fabric_m=main.get("qty"), main_fabric_rate=main.get("rate"),
        fabric=sec.get("fabric"), sewing_trims=sec.get("sewing_trims"), labels_tags=sec.get("label_and_tags"), packing=sec.get("packing_trims"),
        print_emb=(sec.get("print", 0) or 0) + (sec.get("emb", 0) or 0) + (sec.get("print_emb_washing", 0) or 0), cm=sec.get("cm"), testing=sec.get("testing"),
        rejection_pct=rej.get("rate"), overhead_margin_pct=oh.get("rate"), total_before_post=c["total"], total_cost=c["totalCost"], final_price=c["finalPo"], cm_description=cmm.get("description")))
CL = pd.DataFrame(cr)
# one row per distinct client costing (the 5008 colour files are identical)
CLu = CL.drop_duplicates(subset=["layout", "total_cost", "fabric", "cm", "print_emb", "sewing_trims"], keep="first")

# client-vs-actual for style 5008 (the only style that has both)
a5008 = df[df.sheet.str.startswith("5008")]
d5 = a5008.dispatch_pcs.sum()
cmp = pd.DataFrame([
    ("Fabric", 129.75, (a5008.g_Fabric.sum()) / d5),
    ("Print / embroidery", 14.0, a5008.g_Embellishment.sum() / d5),
    ("Sewing + label + packing trims", 3.0 + 3.85 + 7.29, (a5008["g_Labels & Tags"].sum() + a5008["g_Packaging"].sum() + a5008["g_Other"].sum() + a5008.g_Trims.sum()) / d5),
    ("CM / CMT", 62.0, a5008.cmt_total.sum() / d5),
    ("Testing", 0.5, 0.0),
    ("Garment rejection 2% (client; the actual sheet has no such line)", 4.4, 0.0),
    ("Overhead + margin 8% (client; in the actual sheet it is the profit)", 17.59, 0.0),
], columns=["component (₹ per piece)", "client costing GETKRTSCUT5008", "actual (6 colours, weighted by dispatched pcs)"])
cmp.loc[len(cmp)] = ["TOTAL", 242.37, a5008.total_cost.sum() / d5]
cmp["client − actual"] = cmp.iloc[:, 1] - cmp.iloc[:, 2]
cmp.loc[len(cmp)] = ["memo: value loss of the actual sheets (kept outside cost and profit)", np.nan, a5008.value_loss.sum() / d5, np.nan]

# production reconciliation (notes beside the sheets): metres ordered vs received vs used, pieces cut vs dispatched
rec = df.dropna(subset=["received_m"])[["sheet", "family", "fab_m", "received_m", "ordered_vs_received_pct", "base_rate", "cut_pcs", "dispatch_pcs", "used_m", "used_per_cut", "received_per_cut", "consumption_cell", "m_per_dispatched_pc"]].copy()
rec["metres_not_received"] = rec.fab_m - rec.received_m
rec["value_of_gap"] = rec.metres_not_received.clip(lower=0) * rec.base_rate
rec["value_of_gap_per_pc"] = rec.value_of_gap / rec.dispatch_pcs
rec["cut_vs_dispatched_pct"] = (rec.cut_pcs / rec.dispatch_pcs - 1) * 100
rec["note"] = np.where(rec.sheet.isin(["5009 - FUCHSIA", "5009 - BLACK", "5008 - fuchsia"]), "identical notes on three sheets – treat as unreliable", "")
rec = rec.rename(columns={"fab_m": "metres_ordered_costed", "base_rate": "rate_per_m", "m_per_dispatched_pc": "purchased_m_per_dispatched_pc"})
ok_rec = rec[rec.note == ""]
rec_total = pd.DataFrame([dict(sheet="TOTAL (sheets without the 3 suspect ones)", metres_ordered_costed=ok_rec.metres_ordered_costed.sum(), received_m=ok_rec.received_m.sum(),
    metres_not_received=ok_rec.metres_not_received.clip(lower=0).sum(), value_of_gap=ok_rec.value_of_gap.sum(), value_of_gap_per_pc=ok_rec.value_of_gap.sum() / ok_rec.dispatch_pcs.sum(),
    ordered_vs_received_pct=ok_rec.metres_not_received.clip(lower=0).sum() / ok_rec.metres_ordered_costed.sum() * 100)])
rec = pd.concat([rec, rec_total], ignore_index=True)


# ─────────── which styles have which files ───────────
CADL = D.get("cad", [])
ENC = D.get("encrypted", [])
def digits(x):
    d = re.findall(r"\d{4,5}", str(x))
    return d[-1] if d else None
act_styles = {re.match(r"\d+", a["sheet"]).group(0) for a in A}
cli_map = {}
for c in C:
    st = digits(c["file"]) if c["file"].startswith("YAS") else digits(c["productId"]) or digits(c["file"])
    cli_map.setdefault(st, []).append(c["file"])
enc_styles = {digits(f) for f in ENC}
cad_map = {}
for c in CADL:
    cad_map.setdefault(c["style"], []).append(c)
sum_styles = {re.findall(r"(\d{4,5})(?:/\d+)?$", r["styleNo"])[0] for r in SUM}
cov = []
for st in sorted(act_styles | set(k for k in cli_map if k) | enc_styles | set(cad_map) | sum_styles, key=lambda x: (len(x), x)):
    cov.append(dict(style=st, actual_costing=("yes" if st in act_styles else ""), client_costing_readable=", ".join(cli_map.get(st, [])), client_costing_password_protected=("yes" if st in enc_styles else ""),
                    cad_markers=len(cad_map.get(st, [])) or "", in_yousta_summary=("yes" if st in sum_styles else "")))
COV = pd.DataFrame(cov)
COV["has_actual_and_client"] = np.where((COV.actual_costing == "yes") & ((COV.client_costing_readable != "") | (COV.client_costing_password_protected == "yes")), "YES", "")
COV["client_file_state"] = np.where(COV.client_costing_password_protected == "yes", "password protected (cannot be read)", np.where(COV.client_costing_readable != "", "readable", ""))
COV = COV.sort_values(["has_actual_and_client", "style"], ascending=[False, True], key=lambda s_: s_ if s_.name != "style" else s_.map(lambda v: (len(v), v))).reset_index(drop=True)

# client vs actual for every style that has both a readable client file and an actual sheet
def a_comp(x):
    d = x.dispatch_pcs.sum()
    return dict(a_fabric=x.g_Fabric.sum() / d, a_embellishment=x.g_Embellishment.sum() / d, a_trims=(x["g_Labels & Tags"].sum() + x.g_Packaging.sum() + x.g_Other.sum() + x.g_Trims.sum()) / d,
                a_cmt=x.cmt_total.sum() / d, a_cost=x.total_cost.sum() / d, a_sale_rate=x.sale_value.sum() / d, a_colours=len(x), a_pcs=d)
pairs = []
for st in sorted(act_styles & {k for k in cli_map if k}, key=lambda v: (len(v), v)):
    ax = df[df.sheet.str.match(rf"^{st}(\b| -)")]
    cl = [c for c in C if (digits(c["file"]) == st if c["file"].startswith("YAS") else (digits(c["productId"]) or digits(c["file"])) == st)]
    if ax.empty or not cl:
        continue
    c = cl[0]
    sec = {x["key"]: x["total"] for x in c["sections"]}
    pe = (sec.get("print", 0) or 0) + (sec.get("emb", 0) or 0) + (sec.get("print_emb_washing", 0) or 0)
    trims_c = (sec.get("sewing_trims", 0) or 0) + (sec.get("label_and_tags", 0) or 0) + (sec.get("packing_trims", 0) or 0)
    filled = (sec.get("fabric", 0) or 0) > 0
    rej = next((l for l in c["lines"] if l["section"] == "garment_rejection"), {}).get("rate")
    oh = next((l for l in c["lines"] if l["section"] == "overhead_margin"), {}).get("rate")
    row = dict(style=st, client_file=c["file"], layout=c["layout"], client_fabric_filled="yes" if filled else "NO – fabric and embroidery left blank", client_fabric=sec.get("fabric"), client_print_emb=pe, client_trims=trims_c,
               client_cm=sec.get("cm"), client_testing=sec.get("testing"), client_rejection_pct=rej, client_oh_margin_pct=oh, client_total_cost=c["totalCost"], client_final_price=c["finalPo"])
    row.update(a_comp(ax))
    row["fabric_diff"] = (row["client_fabric"] - row["a_fabric"]) if filled else None
    row["emb_diff"] = (row["client_print_emb"] - row["a_embellishment"]) if filled else None
    row["trims_diff"] = row["client_trims"] - row["a_trims"]
    row["cm_diff"] = row["client_cm"] - row["a_cmt"]
    row["price_vs_actual_cost"] = row["client_final_price"] - row["a_cost"] if filled else None
    sm = next((r_ for r_ in SUM if digits(r_["styleNo"].split("/")[0]) == st), None)
    row["po_cost_per_summary"] = sm["poCost"] if sm else None
    pairs.append(row)
PAIRS = pd.DataFrame(pairs)

# every CAD marker next to the costing of its style
cad_tab = []
for st, ms in sorted(cad_map.items(), key=lambda kv: (len(kv[0]), kv[0])):
    x = df[df.sheet.str.match(rf"^{st}(\b| -)")]
    cells = sorted({f"{v:g}" for v in x.consumption_cell.dropna()})
    for m_ in ms:
        cad_tab.append(dict(style=st, marker_file=m_["file"], width_in=m_["widthIn"], sets=m_["sets"], marker_length_m=m_["lengthM"], length_per_set_m=m_["lengthPerSet"], pieces=m_["pieces"], efficiency_pct=m_["efficiency"],
            costing_cell=", ".join(cells) or "no costing sheet", purchased_m_per_dispatched_pc=", ".join(f"{v:.2f}" for v in x.m_per_dispatched_pc.dropna()), used_per_cut_pc=", ".join(f"{v:.2f}" for v in x.used_per_cut.dropna())))
CADT = pd.DataFrame(cad_tab)

# issues
issues = []
def add(sev, where, what, why):
    issues.append(dict(severity=sev, where=where, issue=what, why_it_matters=why))
add("Check", "0557 vs 0556", "identical cost sheets (cost/pc 213.94) but consumption cell 1.16 vs 1.60; purchase is 1.67 m/pc in both", "0557's consumption cell is inconsistent with its own fabric purchase (+44%); one sheet looks copied")
add("Check", "5009 FUCHSIA / 5009 BLACK / 5008 fuchsia", "production notes identical (fabric rec 10963 m, used 10806 m, cut 7156 pcs) and the two 5009 sheets cost 190.46 vs 190.43", "colour sheets look copied; real per-colour data missing")
add("Check", "5009 sheets", "fabric ordered 13,656 m but received 10,963 m (−20%) – the sheet is costed on ordered metres", "fabric cost may be overstated by ≈₹24/pc if the shortfall was never billed")
add("Check", "18 of 21 sheets with 'fabric received' notes", "metres costed (ordered) exceed metres received", "costing on ordered, not received/billed metres: see sheet '5c Production reconciliation'")
add("Check", "3113, 2220, 1851, 2362, 2083", "consumption cell 1.33–1.38 (a repeated default) while purchased metres per piece are 1.56–1.87 (+15% … +35%)", "the cell is a carried-over default, not measured")
add("Check", "2386", "consumption 0.75 m vs 0.92 m purchased per piece (+22%)", "likely a short garment; verify")
add("Title", "sheet 5005 / 6100 / 2220", "A1 titles say '5056 - blue' / '6012 - maroon' / '3113 - white'", "wrong style on the sheet: costs may belong to the sheet-tab style")
add("Title", "sheet 5008 - peach", "title says SAGE GREEN", "tab and title disagree on the colour")
add("Missing", "5052", "no consumption entered", "cannot compare purchase to plan")
add("Missing", "5007", "'40X30s COTTON Greige' row has quantity 0 at rate 45", "template row left in with a rate")
add("Check", "value loss", f"₹{df.value_loss.sum():,.0f} across 9 sheets (largest: 5059 = ₹70,397, 10.2% of its cost; 3113 = 6.1%; 1851 = 4.1%)", "the sheets compute 'Total Value Loss' but never subtract it from PROFIT, so real profit is lower than shown")
add("Check", "YAS26ZWEWYF72300 (client)", "CM price typed 85 in the price column, amount typed 75 in the total column (hard-coded)", "the total uses 75, the price column says 85")
add("Format", "YOUSTA summary file", "colours differ from the actual sheets (e.g. 65424 Lilac vs WHITE, 71447 WHITE vs off white, 0557 GREEN vs aqua)", "colour is not a reliable key between files")
add("Missing", "GETKRTSFUT6002 ×2, 6098, 6099, 6100", "password protected client costings (6100 is the client costing of actual sheet 6100)", "style 6100 has an actual sheet, a CAD and a client costing, but the client file cannot be read: password needed")
add("Check", "YAS client files 71429, 71447, 72145, 74643", "client costing exists but fabric and embroidery are blank (total ₹104–114 against a PO price of ₹336–370)", "only trims, labels, packing, CM ₹75, testing, 2% rejection and overhead are filled; the client fabric allowance cannot be compared")
add("Format", "style 72232 CAD", "three markers: block 0.77 m (10 pieces), AADA 0.93 m (35 pieces), full width 1.52 m (45 = 10 + 35 pieces)", "the earlier single CAD (0.77 m) was only a part; consumption needs the right marker or the sum")
add("Format", "style 6206 CAD vs costing", "three markers 1.10 + 0.78 + 1.35 = 3.23 m; the costing consumption is typed =1.1+0.8+1.35+0.05+0.17 = 3.47", "a style can need several markers whose lengths add up; the engine reads one CAD per style")
add("Format", "style 5008", "appears as YETKRTSCUT5008 (actual) and GETKRTSCUT5008 (client)", "confirm whether YET and GET are the same brand")
ISS = pd.DataFrame(issues)

# ─────────────────────────── README ───────────────────────────
readme = pd.DataFrame({"": [
    "COST ANALYSIS – United Textile Mills",
    "",
    f"Actual costing sheets: {len(A)} read, {len(AU)} unique (5 sheets are repeated in the second workbook). Client costing sheets: {len(C)} (GET {sum(c['layout']=='GET' for c in C)}, YOUSTA {sum(c['layout']=='YOUSTA' for c in C)}). YOUSTA cost summary: {len(S)} styles.",
    "Every actual sheet is recomputed by the Cost Engine and equals the workbook's own totals; 4 password-protected client files could not be read.",
    "",
    "BRAND FAMILIES (derived from the files, not from a brand master – none exists):",
    "  YOUSTA: 28 actual sheets – the workbook-1 styles (5-digit 6xxxx/7xxxx and the 0xxx/1xxx/2xxx/3xxx series), all in the YOUSTA cost summary or numbered like 2243 (a YOUSTA client sheet, vendor code 32026735).",
    "  KRTS (GET/YET): 30 actual sheets – product IDs YETKRTS… / RETKRTS… (client sheets GETKRTS…), styles 4xxx/5xxx/6xxx. 5xxx = 'CUT' series, 4xxx = 'FUT' series; 6xxx assumed FUT (client files GETKRTSFUT6421/6422/6457).",
    "  The brand name of the KRTS family is not stated in any file (client vendor code RR10337044). Confirm and the segments can be relabelled.",
    "",
    "DEFINITIONS",
    "  Cost per piece = actual total cost ÷ dispatched pieces (as in the sheets). Profit % = per-piece profit ÷ order rate (as in the sheets; value loss is not deducted).",
    "  Fabric group = fabric purchase + its finishing / printing; Embellishment = embroidery, hand work, foil print, scallop; Add-on trims = lace, tassels, button, zipper, elastic.",
    "  Landed fabric rate (₹/m) = (purchase + finishing/printing) ÷ metres purchased. Purchased metres per piece = metres of the fabric purchase line ÷ dispatched pieces.",
    "  Consumption cell = the CONSUPMTION figure typed in each sheet. Kurta/top = under 2.2 m; Set/long = 2.2 m or more (3 sheets: 67762, 2397, 6206).",
    "  Standard cost = median of the sheets in a segment (robust to the few outliers); weighted averages are labelled as such.",
    "",
    "CAUTIONS",
    "  Sample sizes are small per cell (see the 'sheets' column). Medians of n<5 are indicative only.",
    "  Several sheets look copied from another style (see 'Data issues'); they are included, not corrected.",
]})

# ─────────────────────────── write workbook ───────────────────────────
def pretty(ws, widths=None, pct=(), money=(), ints=()):
    head = PatternFill("solid", fgColor="1D3557")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = head; c.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "A2"
    for i, col in enumerate(ws.columns, 1):
        w = max((len(str(c.value)) if c.value is not None else 0) for c in list(col)[:60])
        ws.column_dimensions[get_column_letter(i)].width = min(max(10, w + 2), 48)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, float):
                c.number_format = "#,##0.00"
            if isinstance(c.value, (int, float)) and abs(c.value) >= 1000:
                c.number_format = "#,##0"

sheets = [
    ("README", readme, {}),
    ("1 Brand summary", T_family, {}),
    ("2 Segments", T_seg, {}),
    ("3 Standard cost", std, {}),
    ("4 Fabric rates", fab_rate, {}),
    ("4b Fabric by brand", fab_rate_family, {}),
    ("5 Consumption", cons_fam, {}),
    ("5b Consumption by fabric", cons_type, {}),
    ("5c Production reconciliation", rec, {}),
    ("5d CAD markers vs costing", CADT, {}),
    ("6 Embellishment", emb, {}),
    ("6b Embellishment by brand", emb_fam, {}),
    ("7 CMT", cmt, {}),
    ("7b CMT common values", cmt_mode, {}),
    ("8 Trims rate card", trims, {}),
    ("8b Pcs per carton", cart, {}),
    ("9 Sale price tiers", sale_tiers, {}),
    ("10 Margins", margin, {}),
    ("11 YOUSTA PO vs actual", S[["styleNo", "colour", "poQty", "dispatched", "poCost", "actualCost", "margin_per_pc", "margin_pct", "billed_value", "actual_cost_value", "sheet", "cost_per_pc", "actual_sheet_minus_summary", "sale_rate", "po_cost_minus_actual_sheet_rate"]], {}),
    ("12 Client sheets", CLu, {}),
    ("13 Client vs actual 5008", cmp, {}),
    ("13b Client vs actual all pairs", PAIRS, {}),
    ("13c Coverage by style", COV, {}),
    ("14 Colourways 5008-5009", colour, {}),
    ("15 Data issues", ISS, {}),
    ("16 Dataset (actual)", df.drop(columns=["moved"]), {}),
]
with pd.ExcelWriter(out, engine="openpyxl") as w:
    for name, frame, _ in sheets:
        frame.to_excel(w, sheet_name=name, index=False)
wb = load_workbook(out)
for name, _, _ in sheets:
    pretty(wb[name])
wb["README"].column_dimensions["A"].width = 160
wb["README"]["A1"].font = Font(bold=True, size=13, color="FFFFFF")
for r in wb["README"].iter_rows(min_row=2):
    for c in r: c.alignment = Alignment(wrap_text=True, vertical="top")
wb.save(out)

# a compact JSON for the write-up
summary = dict(
    families=T_family.round(2).to_dict("records"), segments=T_seg.round(2).to_dict("records"), standard=std.round(1).to_dict("records"), fabric=fab_rate.round(1).to_dict("records"),
    consumption=cons_fam.round(2).to_dict("records"), emb=emb.round(2).to_dict("records"), cmt=cmt.round(2).to_dict("records"), trims=trims.round(3).to_dict("records"),
    cartons=cart.round(1).to_dict("records"), tiers=sale_tiers.round(0).to_dict("records"), compare5008=cmp.round(2).to_dict("records"),
    yousta_total=dict(billed=float(S.billed_value.sum()), cost=float(S.actual_cost_value.sum()), margin_pct=float((S.billed_value.sum() - S.actual_cost_value.sum()) / S.billed_value.sum() * 100), median=float(S.margin_pct.median()), min=float(S.margin_pct.min()), max=float(S.margin_pct.max())),
)
json.dump(summary, open(out.replace(".xlsx", ".json"), "w"), indent=1, default=float)
print("written", out, "| sheets:", len(wb.sheetnames))
