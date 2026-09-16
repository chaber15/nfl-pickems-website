#!/usr/bin/env python3
"""Build sendable 2025 ATS deep-dive PDFs for each player."""

from __future__ import annotations

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path("/Users/calebhaber/Documents/NFL Pick'ems Website")
XLSX = ROOT / "NFL Spread Picking.xlsx"
OUT_DIR = ROOT / "reports"

NAVY = "#1B3A4B"
INK = "#1A1A1A"
MUTED = "#5C6670"
RULE = "#D8DEE4"
PLUS = "#1F7A4D"
MINUS = "#B42318"
STEEL = "#4A6FA5"
CREAM = "#F4F1EA"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

NICK_ALIASES = {
    "eagles": "Eagles",
    "cowboys": "Cowboys",
    "commanders": "Commanders",
    "commaners": "Commanders",
    "giants": "Giants",
    "chiefs": "Chiefs",
    "cheifs": "Chiefs",
    "chargers": "Chargers",
    "raiders": "Raiders",
    "broncos": "Broncos",
    "patriots": "Patriots",
    "patirots": "Patriots",
    "bills": "Bills",
    "dolphins": "Dolphins",
    "doplphins": "Dolphins",
    "jets": "Jets",
    "ravens": "Ravens",
    "bengals": "Bengals",
    "browns": "Browns",
    "steelers": "Steelers",
    "steelres": "Steelers",
    "texans": "Texans",
    "colts": "Colts",
    "jaguars": "Jaguars",
    "jags": "Jaguars",
    "titans": "Titans",
    "packers": "Packers",
    "packres": "Packers",
    "lions": "Lions",
    "vikings": "Vikings",
    "bears": "Bears",
    "ebars": "Bears",
    "falcons": "Falcons",
    "saints": "Saints",
    "buccaneers": "Buccaneers",
    "bucs": "Buccaneers",
    "panthers": "Panthers",
    "panters": "Panthers",
    "49ers": "49ers",
    "seahawks": "Seahawks",
    "rams": "Rams",
    "ram": "Rams",
    "cardinals": "Cardinals",
    "cardnials": "Cardinals",
    "washington": "Commanders",
}
FULL_FIXES = [
    (r"kansas city ch", "Chiefs"),
    (r"new england pa", "Patriots"),
    (r"carolina pan", "Panthers"),
    (r"arizona card", "Cardinals"),
    (r"los angeles ram", "Rams"),
    (r"\bla ram", "Rams"),
    (r"chicago (ebars|bears|ebear)", "Bears"),
    (r"green bay pack", "Packers"),
    (r"min+esota vik", "Vikings"),
    (r"san francisco", "49ers"),
    (r"dallas cow", "Cowboys"),
    (r"philadelphia eag", "Eagles"),
    (r"washington comm", "Commanders"),
    (r"new york gia", "Giants"),
    (r"los angeles cha|la chargers", "Chargers"),
    (r"las vegas rai", "Raiders"),
    (r"denver bron", "Broncos"),
    (r"buffalo bill", "Bills"),
    (r"miami do", "Dolphins"),
    (r"new york jet", "Jets"),
    (r"baltimore rav", "Ravens"),
    (r"cinn?cinn?ati ben", "Bengals"),
    (r"cleveland brow", "Browns"),
    (r"pittsburgh steel", "Steelers"),
    (r"houston tex", "Texans"),
    (r"indianapolis col", "Colts"),
    (r"jacksonville jag", "Jaguars"),
    (r"tennessee tit", "Titans"),
    (r"detroit lion", "Lions"),
    (r"atlanta fal", "Falcons"),
    (r"new orleans sai", "Saints"),
    (r"tampa bay buc", "Buccaneers"),
    (r"seattle sea", "Seahawks"),
]
DIVISIONS = {
    "Eagles": "NFC East",
    "Cowboys": "NFC East",
    "Commanders": "NFC East",
    "Giants": "NFC East",
    "Packers": "NFC North",
    "Lions": "NFC North",
    "Vikings": "NFC North",
    "Bears": "NFC North",
    "Buccaneers": "NFC South",
    "Falcons": "NFC South",
    "Saints": "NFC South",
    "Panthers": "NFC South",
    "49ers": "NFC West",
    "Seahawks": "NFC West",
    "Rams": "NFC West",
    "Cardinals": "NFC West",
    "Bills": "AFC East",
    "Dolphins": "AFC East",
    "Jets": "AFC East",
    "Patriots": "AFC East",
    "Ravens": "AFC North",
    "Bengals": "AFC North",
    "Browns": "AFC North",
    "Steelers": "AFC North",
    "Texans": "AFC South",
    "Colts": "AFC South",
    "Jaguars": "AFC South",
    "Titans": "AFC South",
    "Chiefs": "AFC West",
    "Chargers": "AFC West",
    "Broncos": "AFC West",
    "Raiders": "AFC West",
}
CONFERENCES = {t: ("NFC" if d.startswith("NFC") else "AFC") for t, d in DIVISIONS.items()}
PLAYER_KEYS = {
    "caleb": "Caleb",
    "grace": "Grace",
    "peter": "Peter/Sean",
    "sean": "Peter/Sean",
    "ben": "Ben",
    "logan": "Logan",
}
WEEK_META = [
    ("Week One", 1, "regular", "Week 1"),
    ("Week Two", 2, "regular", "Week 2"),
    ("Week Three", 3, "regular", "Week 3"),
    ("Week Four ", 4, "regular", "Week 4"),
    ("Week Five", 5, "regular", "Week 5"),
    ("Week Six", 6, "regular", "Week 6"),
    ("Week Seven", 7, "regular", "Week 7"),
    ("Week Eight", 8, "regular", "Week 8"),
    ("Week Nine", 9, "regular", "Week 9"),
    ("Week Ten", 10, "regular", "Week 10"),
    ("Week Eleven", 11, "regular", "Week 11"),
    ("Week Twelve", 12, "regular", "Week 12"),
    ("Week Thirteen", 13, "regular", "Week 13"),
    ("Week Fourteen", 14, "regular", "Week 14"),
    ("Week Fifteen", 15, "regular", "Week 15"),
    ("Week Sixteen", 16, "regular", "Week 16"),
    ("Week Seventeen", 17, "regular", "Week 17"),
    (" Week Eighteen", 18, "regular", "Week 18"),
    ("Wild Card Week", 19, "wildcard", "Wild Card"),
    ("Divisional Round", 20, "divisional", "Divisional"),
    ("Confrence Championship", 21, "conference", "Conf. Champ"),
    ("Superbowl", 22, "superbowl", "Super Bowl"),
]
LINE_ORDER = [
    "Fav -10+",
    "Fav -7 to -9.5",
    "Fav -4 to -6.5",
    "Fav -3 to -3.5",
    "Fav -1 to -2.5",
    "Dog +1 to +2.5",
    "Dog +3 to +3.5",
    "Dog +4 to +6.5",
    "Dog +7 to +9.5",
    "Dog +10+",
]
SLOT_ORDER = [
    "Thursday",
    "Friday",
    "Saturday",
    "London / early",
    "Sunday early",
    "Sunday late",
    "Sunday night",
    "Monday",
]
PLAYERS_OUT = [
    ("Caleb", "Caleb Haber", "Caleb_2025_ATS_Deep_Dive.pdf"),
    ("Grace", "Grace", "Grace_2025_ATS_Deep_Dive.pdf"),
    ("Peter/Sean", "Peter / Sean", "Peter_Sean_2025_ATS_Deep_Dive.pdf"),
]


def col_row(cell_ref: str):
    m = re.match(r"([A-Z]+)(\d+)", cell_ref)
    return m.group(1), int(m.group(2))


def col_to_idx(col: str) -> int:
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n


def norm_team(s):
    if s is None:
        return None
    raw = str(s).strip()
    if not raw:
        return None
    key = re.sub(r"\s+", " ", raw.lower())
    for pat, canon in FULL_FIXES:
        if re.search(pat, key):
            return canon
    last = key.split()[-1]
    if last in NICK_ALIASES:
        return NICK_ALIASES[last]
    for nick, canon in NICK_ALIASES.items():
        if nick and re.search(r"\b" + re.escape(nick) + r"\b", key):
            return canon
    return raw


def parse_spread(s):
    if s is None:
        return None, None
    text = str(s).strip()
    m = re.search(r"(49ers)\s*-?\s*(\d+(?:\.\d+)?)", text, re.I)
    if m:
        return "49ers", abs(float(m.group(2)))
    m = re.search(r"(.+?)\s*-\s*(\d+(?:\.\d+)?)", text)
    if not m:
        m = re.search(r"(.+?)\s+([+-]?\d+(?:\.\d+)?)", text)
    if not m:
        return None, None
    return norm_team(m.group(1)), abs(float(m.group(2)))


def parse_odds(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^0-9+\-.]", "", str(v).replace("−", "-").strip())
    try:
        return float(s)
    except ValueError:
        return None


def parse_side(v):
    if v is None:
        return None
    s = str(v).strip().lower()
    mapping = {
        "favorite": "favorite",
        "fav": "favorite",
        "underdog": "underdog",
        "dog": "underdog",
        "under dog": "underdog",
        "push": "push",
        "home": "home",
        "away": "away",
    }
    return mapping.get(s)


def excel_date(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return datetime(1899, 12, 30) + timedelta(days=float(v))
        except Exception:
            return None
    s = str(v).strip().replace("Thur", "Thu").replace("Thurs", "Thu").replace("Sept", "Sep")
    for fmt in ("%a, %b %d", "%a %b %d"):
        try:
            return datetime.strptime(s + " 2025", fmt + " %Y")
        except ValueError:
            continue
    return None


def excel_time(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        mins = int(round(float(v) * 24 * 60))
        h, m = divmod(mins, 60)
        return h, m
    s = str(v).lower().replace(".", "").strip()
    m = re.search(r"(\d{1,2}):(\d{2})\s*(a|p)", s)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if m.group(3) == "p" and h != 12:
        h += 12
    if m.group(3) == "a" and h == 12:
        h = 0
    return h, mi


def units_from_odds(odds, won):
    if odds is None:
        return None
    if won:
        return odds / 100.0 if odds > 0 else 1.0
    return -1.0 if odds > 0 else -abs(odds / 100.0)


def load_games():
    sheets_data = {}
    with zipfile.ZipFile(XLSX) as z:
        ss = []
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(".//m:si", NS):
            ss.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        sheets = [
            (s.get("name"), s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"))
            for s in wb.findall(".//m:sheet", NS)
        ]
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.get("Id"): rel.get("Target") for rel in rels}
        for name, rid in sheets:
            target = rid_to_target[rid]
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(z.read(target))
            grid = {}
            max_c = 0
            for c in root.findall(".//m:c", NS):
                ref = c.get("r")
                if not ref:
                    continue
                col, row = col_row(ref)
                ci, ri = col_to_idx(col), row
                max_c = max(max_c, ci)
                t = c.get("t")
                v = c.find("m:v", NS)
                val = v.text if v is not None else None
                if t == "s" and val is not None:
                    val = ss[int(val)]
                elif val is not None:
                    try:
                        val = float(val)
                    except ValueError:
                        pass
                grid[(ri, ci)] = val
            sheets_data[name] = (grid, max_c)

    games = []
    for sheet_name, week, phase, label in WEEK_META:
        grid, max_c = sheets_data[sheet_name]
        header = {c: str(grid.get((1, c), "") or "").strip() for c in range(1, max_c + 1)}
        player_cols = {}
        winner_col = None
        for c, h in header.items():
            hl = h.lower().strip()
            if hl == "winner":
                winner_col = c
            for key, name in PLAYER_KEYS.items():
                if key in hl and name not in player_cols:
                    player_cols[name] = (c, c + 1)
        if winner_col is None:
            for c in range(max_c, 11, -1):
                samples = [parse_side(grid.get((r, c))) for r in range(2, 8)]
                if any(s in ("favorite", "underdog", "push") for s in samples) and c not in [
                    p[0] for p in player_cols.values()
                ]:
                    winner_col = c
                    break
        for r in range(2, 30):
            away_raw, home_raw = grid.get((r, 2)), grid.get((r, 4))
            if not away_raw or not home_raw:
                continue
            away, home = norm_team(away_raw), norm_team(home_raw)
            if away not in DIVISIONS or home not in DIVISIONS:
                continue
            fav_nick, spread_mag = parse_spread(grid.get((r, 8)))
            fav_side = parse_side(grid.get((r, 9)))
            if fav_nick in (home, away):
                favorite = fav_nick
                fav_side = "home" if favorite == home else "away"
            elif fav_side in ("home", "away"):
                favorite = home if fav_side == "home" else away
            else:
                continue
            underdog = away if favorite == home else home
            oa, oh = parse_odds(grid.get((r, 10))), parse_odds(grid.get((r, 11)))
            winner = parse_side(grid.get((r, winner_col))) if winner_col else None
            if winner not in ("favorite", "underdog", "push"):
                winner = None
            dt = excel_date(grid.get((r, 5)))
            tm = excel_time(grid.get((r, 6)))
            raw_date_s = str(grid.get((r, 5)) or "").lower()
            picks = {}
            for pname, (pc, plc) in player_cols.items():
                pick = parse_side(grid.get((r, pc)))
                if pick not in ("favorite", "underdog"):
                    pick = None
                pl = grid.get((r, plc))
                try:
                    pl = float(pl) if pl is not None and pl != "" else None
                except (TypeError, ValueError):
                    pl = None
                picked_team = favorite if pick == "favorite" else underdog if pick == "underdog" else None
                if pick == "favorite":
                    pick_odds = oh if fav_side == "home" else oa
                elif pick == "underdog":
                    pick_odds = oa if fav_side == "home" else oh
                else:
                    pick_odds = None
                result = units = None
                if winner == "push":
                    if pick:
                        result, units = "push", 0.0
                elif winner and pick:
                    won = pick == winner
                    result = "win" if won else "loss"
                    units = pl if pl is not None else units_from_odds(pick_odds, won)
                elif pick and pl is not None:
                    if abs(pl) < 1e-9:
                        result, units = "push", 0.0
                    elif pl > 0:
                        result, units = "win", pl
                    else:
                        result, units = "loss", pl
                picks[pname] = {
                    "pick": pick,
                    "team": picked_team,
                    "odds": pick_odds,
                    "units": units,
                    "result": result,
                }
            dow = dt.strftime("%a") if dt else None
            hour = tm[0] if tm else None
            slot = "Other"
            if "thu" in raw_date_s or dow == "Thu":
                slot = "Thursday"
            elif "mon" in raw_date_s or dow == "Mon":
                slot = "Monday"
            elif "sat" in raw_date_s or dow == "Sat":
                slot = "Saturday"
            elif "fri" in raw_date_s or dow == "Fri":
                slot = "Friday"
            elif hour is not None and hour < 13:
                slot = "London / early"
            elif hour is not None and hour >= 20:
                slot = "Sunday night"
            elif hour is not None and 16 <= hour < 20:
                slot = "Sunday late"
            elif hour is not None and 13 <= hour < 16:
                slot = "Sunday early"
            elif dow == "Sun":
                slot = "Sunday early"
            games.append(
                {
                    "week": week,
                    "week_label": label,
                    "phase": phase,
                    "away": away,
                    "home": home,
                    "favorite": favorite,
                    "underdog": underdog,
                    "fav_side": fav_side,
                    "spread": spread_mag,
                    "winner": winner,
                    "slot": slot,
                    "picks": picks,
                    "is_divisional": DIVISIONS.get(away) == DIVISIONS.get(home),
                }
            )
    return games


def rec(rows):
    w = l = p = 0
    u = 0.0
    for _g, pk in rows:
        if pk["result"] == "win":
            w += 1
        elif pk["result"] == "loss":
            l += 1
        elif pk["result"] == "push":
            p += 1
        u += pk["units"] or 0
    n = w + l + p
    corr = w + 0.5 * p
    pct = 100 * corr / n if n else 0
    return {"w": w, "l": l, "p": p, "n": n, "correct": corr, "pct": round(pct, 1), "units": round(u, 2)}


def rows_for(games, name):
    out = []
    for g in games:
        pk = g["picks"].get(name, {})
        if pk.get("result"):
            out.append((g, pk))
    return out


def group(rows, keyfn):
    d = defaultdict(list)
    for item in rows:
        d[keyfn(item)].append(item)
    return {k: rec(v) for k, v in d.items()}


def line_bucket(g, p):
    mag = g["spread"] or 0
    line = -mag if p["pick"] == "favorite" else mag
    if line <= -10:
        return "Fav -10+"
    if line <= -7:
        return "Fav -7 to -9.5"
    if line <= -4:
        return "Fav -4 to -6.5"
    if line <= -3:
        return "Fav -3 to -3.5"
    if line < 0:
        return "Fav -1 to -2.5"
    if line <= 2.5:
        return "Dog +1 to +2.5"
    if line <= 3.5:
        return "Dog +3 to +3.5"
    if line <= 6.5:
        return "Dog +4 to +6.5"
    if line <= 9.5:
        return "Dog +7 to +9.5"
    return "Dog +10+"


def against(g, p):
    return g["away"] if p["team"] == g["home"] else g["home"]


def fmt_rec(r):
    if r["p"]:
        return f"{r['w']}-{r['l']}-{r['p']}"
    return f"{r['w']}-{r['l']}"


def fmt_u(n):
    if n > 0:
        return f"+{n:.2f}"
    if n < 0:
        return f"{n:.2f}"
    return "0.00"


def longest_streak(games, name, target):
    best = cur = 0
    for g in games:
        pk = g["picks"].get(name, {})
        if pk.get("result") not in ("win", "loss"):
            continue
        if pk["result"] == target:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def analyze(games, name):
    all_c = rows_for(games, name)
    overall = rec(all_c)
    by_week = {}
    weekly_labels, weekly_units, weekly_pct, cumulative = [], [], [], []
    running = 0.0
    for w in range(1, 23):
        chunk = [(g, p) for g, p in all_c if g["week"] == w]
        if not chunk:
            continue
        r = rec(chunk)
        label = chunk[0][0]["week_label"]
        by_week[w] = {"label": label, **r}
        weekly_labels.append("W" + str(w) if w <= 18 else label.replace("Conf. Champ", "CC").replace("Wild Card", "WC").replace("Divisional", "Div"))
        weekly_units.append(r["units"])
        weekly_pct.append(r["pct"])
        running += r["units"]
        cumulative.append(round(running, 2))

    team_on = group(all_c, lambda x: x[1]["team"])
    team_ag = group(all_c, lambda x: against(*x))
    others = {}
    for other in ["Caleb", "Grace", "Peter/Sean", "Ben", "Logan"]:
        others[other] = rec(rows_for(games, other))
        others[other]["missed"] = sum(
            1 for g in games if g["winner"] and not g["picks"].get(other, {}).get("pick")
        )

    contra, with_fam, solo = [], [], []
    for g, p in all_c:
        other_picks = [op["pick"] for nm, op in g["picks"].items() if nm != name and op.get("pick")]
        if not other_picks:
            continue
        n_same = sum(1 for o in other_picks if o == p["pick"])
        if n_same == 0:
            solo.append((g, p))
        if n_same == len(other_picks):
            with_fam.append((g, p))
        maj, cnt = Counter(other_picks).most_common(1)[0]
        if cnt > len(other_picks) / 2 and p["pick"] != maj:
            contra.append((g, p))

    tickets = {
        "Home underdog": rec([(g, p) for g, p in all_c if p["pick"] == "underdog" and g["fav_side"] == "away"]),
        "Home favorite": rec([(g, p) for g, p in all_c if p["pick"] == "favorite" and g["fav_side"] == "home"]),
        "Away underdog": rec([(g, p) for g, p in all_c if p["pick"] == "underdog" and g["fav_side"] == "home"]),
        "Away favorite": rec([(g, p) for g, p in all_c if p["pick"] == "favorite" and g["fav_side"] == "away"]),
    }
    return {
        "name": name,
        "overall": overall,
        "missed": sum(1 for g in games if g["winner"] and not g["picks"].get(name, {}).get("pick")),
        "first": rec([(g, p) for g, p in all_c if 1 <= g["week"] <= 9]),
        "second": rec([(g, p) for g, p in all_c if 10 <= g["week"] <= 18]),
        "regular": rec([(g, p) for g, p in all_c if g["phase"] == "regular"]),
        "playoffs": rec([(g, p) for g, p in all_c if g["phase"] != "regular"]),
        "side": group(all_c, lambda x: x[1]["pick"]),
        "home_away": group(all_c, lambda x: "home" if x[1]["team"] == x[0]["home"] else "away"),
        "tickets": tickets,
        "slots": group(all_c, lambda x: x[0]["slot"]),
        "lines": group(all_c, lambda x: line_bucket(*x)),
        "spread_size": group(
            all_c,
            lambda x: (
                "1-2.5"
                if (x[0]["spread"] or 0) <= 2.5
                else "3-3.5"
                if x[0]["spread"] <= 3.5
                else "4-6.5"
                if x[0]["spread"] <= 6.5
                else "7-9.5"
                if x[0]["spread"] <= 9.5
                else "10+"
            ),
        ),
        "team_on": team_on,
        "team_ag": team_ag,
        "conf": group(all_c, lambda x: CONFERENCES[x[1]["team"]]),
        "div": group(all_c, lambda x: DIVISIONS[x[1]["team"]]),
        "unanimous": rec(with_fam),
        "lone": rec(solo),
        "fade": rec(contra),
        "div_games": rec([(g, p) for g, p in all_c if g["is_divisional"]]),
        "non_div": rec([(g, p) for g, p in all_c if not g["is_divisional"]]),
        "weekly_labels": weekly_labels,
        "weekly_units": weekly_units,
        "weekly_pct": weekly_pct,
        "cumulative": cumulative,
        "by_week": by_week,
        "others": others,
        "win_streak": longest_streak(games, name, "win"),
        "loss_streak": longest_streak(games, name, "loss"),
        "roi": round(100 * overall["units"] / overall["n"], 1) if overall["n"] else 0,
    }


def best_worst(mapping, n=5, reverse=True):
    return sorted(mapping.items(), key=lambda kv: kv[1]["units"], reverse=reverse)[:n]


def style_mpl():
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.edgecolor": RULE,
            "axes.labelcolor": MUTED,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "text.color": INK,
            "axes.titleweight": "medium",
            "axes.titlesize": 11,
            "axes.labelsize": 9,
            "xtick.labelsize": 8,
            "ytick.labelsize": 8,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.grid": True,
            "grid.color": "#EEF1F4",
            "grid.linewidth": 0.8,
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )


def fig_to_image(fig, width=7.1, height=2.6):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=width * inch, height=height * inch)


def line_chart(labels, values, title, ylabel, zero_line=False, pct=False):
    fig, ax = plt.subplots(figsize=(7.4, 2.7))
    ax.plot(range(len(values)), values, color=NAVY, linewidth=2.0, marker="o", markersize=3.5)
    ax.fill_between(range(len(values)), values, 0 if zero_line else min(values), color=STEEL, alpha=0.12)
    if zero_line:
        ax.axhline(0, color=RULE, linewidth=1)
    if pct:
        ax.axhline(50, color=MUTED, linewidth=0.8, linestyle="--")
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_title(title, loc="left", color=NAVY)
    ax.set_ylabel(ylabel)
    ax.yaxis.set_major_locator(MaxNLocator(6))
    fig.tight_layout()
    return fig_to_image(fig)


def bar_chart(labels, values, title, ylabel, horizontal=False, height=2.7):
    fig, ax = plt.subplots(figsize=(7.4, height))
    bar_colors = [PLUS if v > 0 else MINUS if v < 0 else MUTED for v in values]
    if horizontal:
        ax.barh(range(len(values)), values, color=bar_colors, height=0.62)
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels)
        ax.axvline(0, color=RULE, linewidth=1)
        ax.invert_yaxis()
    else:
        ax.bar(range(len(values)), values, color=bar_colors, width=0.72)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=45, ha="right")
        ax.axhline(0, color=RULE, linewidth=1)
    ax.set_title(title, loc="left", color=NAVY)
    ax.set_xlabel(ylabel if horizontal else "")
    ax.set_ylabel("" if horizontal else ylabel)
    fig.tight_layout()
    return fig_to_image(fig, height=height)


def grouped_bar(labels, series, title, ylabel):
    fig, ax = plt.subplots(figsize=(7.4, 2.7))
    x = range(len(labels))
    width = 0.36
    colors_s = [NAVY, STEEL]
    for i, (name, vals) in enumerate(series):
        offset = (i - 0.5) * width
        ax.bar([xi + offset for xi in x], vals, width=width, label=name, color=colors_s[i])
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_title(title, loc="left", color=NAVY)
    ax.set_ylabel(ylabel)
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    return fig_to_image(fig)


def styles():
    base = getSampleStyleSheet()
    s = {
        "kicker": ParagraphStyle(
            "kicker",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=9,
            textColor=colors.HexColor(NAVY),
            letterSpacing=1.2,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor(NAVY),
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor(NAVY),
            spaceBefore=12,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Times-Bold",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor(INK),
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor(INK),
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        ),
        "caption": ParagraphStyle(
            "caption",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor(MUTED),
            spaceAfter=10,
        ),
        "stat": ParagraphStyle(
            "stat",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor(NAVY),
        ),
        "statl": ParagraphStyle(
            "statl",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor(MUTED),
        ),
        "q": ParagraphStyle(
            "q",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor(NAVY),
            spaceBefore=4,
            spaceAfter=3,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            textColor=colors.HexColor(MUTED),
            alignment=TA_CENTER,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor(INK),
        ),
        "cellb": ParagraphStyle(
            "cellb",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor(INK),
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13,
            leftIndent=12,
            spaceAfter=3,
            textColor=colors.HexColor(INK),
        ),
    }
    return s


def header_footer(display_name):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor(NAVY))
        canvas.rect(0, letter[1] - 28, letter[0], 28, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Times-Bold", 9)
        canvas.drawString(0.7 * inch, letter[1] - 18, f"{display_name}  ·  2025 NFL spread pick'em")
        canvas.setFont("Times-Roman", 8)
        canvas.drawRightString(letter[0] - 0.7 * inch, letter[1] - 18, "Family league report")
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.setFont("Times-Roman", 8)
        canvas.drawString(0.7 * inch, 0.42 * inch, "Source: NFL Spread Picking.xlsx  ·  Super Bowl excluded (ungraded)")
        canvas.drawRightString(letter[0] - 0.7 * inch, 0.42 * inch, f"{doc.page}")
        canvas.restoreState()

    return draw


def stat_strip(items, S):
    data = [[Paragraph(v, S["stat"]) for v, _l in items], [Paragraph(l, S["statl"]) for _v, l in items]]
    t = Table(data, colWidths=[7.1 * inch / len(items)] * len(items))
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(CREAM)),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor(RULE)),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor(RULE)),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def simple_table(headers, rows, S, col_widths=None):
    head = [Paragraph(h, S["cellb"]) for h in headers]
    body = [[Paragraph(str(c), S["cell"]) for c in row] for row in rows]
    t = Table([head] + body, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Times-Bold"),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F7F5F0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F7F5F0"), colors.white]),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor(RULE)),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor(RULE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    # force header paragraphs white
    for i, h in enumerate(headers):
        head[i] = Paragraph(f'<font color="white"><b>{h}</b></font>', S["cell"])
    t = Table([head] + body, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


def narrative(a, display):
    o = a["overall"]
    first, second, po = a["first"], a["second"], a["playoffs"]
    fav = a["side"].get("favorite", rec([]))
    dog = a["side"].get("underdog", rec([]))
    home = a["home_away"].get("home", rec([]))
    away = a["home_away"].get("away", rec([]))
    best_teams = best_worst(a["team_on"], 3, True)
    worst_teams = best_worst(a["team_on"], 3, False)
    most_bet = sorted(a["team_on"].items(), key=lambda kv: -kv[1]["n"])[0]
    best_line = max(a["lines"].items(), key=lambda kv: kv[1]["units"])
    worst_line = min(a["lines"].items(), key=lambda kv: kv[1]["units"])
    worst_slot = min(
        ((k, v) for k, v in a["slots"].items() if v["n"] >= 8),
        key=lambda kv: kv[1]["units"],
        default=("n/a", rec([])),
    )
    best_slot = max(
        ((k, v) for k, v in a["slots"].items() if v["n"] >= 8),
        key=lambda kv: kv[1]["units"],
        default=("n/a", rec([])),
    )
    best_w = max(a["by_week"].values(), key=lambda r: r["units"])
    worst_w = min(a["by_week"].values(), key=lambda r: r["units"])

    if a["name"] == "Grace":
        lede = (
            f"{display} took every available game — 284 graded picks, zero missed — and still finished "
            f"last in both hit rate and units. This was not a cold month. It was a full-season 41.7% "
            f"profile that never got above water. The damage is concentrated: Thursday nights "
            f"(5-15-1, -11.73u), division games (37.9%, -30.29u), and a Week 17 collapse (2-13-1, -11.92u)."
        )
        keep = [
            "Ride the Patriots and Seahawks when they are live. Those two were +10.38u combined.",
            "Trust Sunday late (4:00 ET). It was the only window that finished green: 37-31, +1.37u.",
            "NFC West was the one division that paid (22-17, +3.55u). That is the Seahawks / 49ers read.",
        ]
        stop = [
            "Stop taking every Thursday game. 26.2% ATS is not a sample-size excuse at 21 bets.",
            "Fade fewer Seahawks and stop betting the Chiefs, Cowboys, and Dolphins on instinct.",
            "Division games were 37.9%. Sit more of those out, or flip the side you usually take.",
            "You leaned favorites 170-114. That volume did not have an edge (42.4%, -34.83u).",
        ]
    elif a["name"] == "Peter/Sean":
        lede = (
            f"{display} ran a near-break-even year that hid a real playoff heater and one ugly leak. "
            f"Regular season: 47.8% and -14.79u. Playoffs: 7-5 and +1.27u, including a 5-1 Wild Card. "
            f"The hole is 7-to-9.5-point games (31.6%, -16.72u). Everything else is a workable bettor."
        )
        keep = [
            "Keep taking big favorites (-10 or more went 10-5-1, +6.67u) and +3 / +3.5 dogs (11-6, +3.87u).",
            "NFC West again: 23-12, +9.91u. Rams 10-4 and Seahawks 6-1 were the engines.",
            "Fade the family when you actually disagree (54.5%, +3.96u) and trust lone-wolf picks (56.2%).",
            "Monday and Sunday night were fine. You do not have Caleb's primetime problem.",
        ]
        stop = [
            "Do not lay 7 to 9.5 points. That bucket is 10-20 and -7.18u as a favorite, 5-13 as a dog.",
            "Commanders were the most-bet team (17) and a -4.70u loser. Same loyalty tax as everyone else.",
            "Fading Seattle was a disaster (2-9, -8.12u). If you are not on them, just pass.",
            "Week 4 (4-12, -9.05u) is the template for 'we talked ourselves into a bad card.'",
        ]
    else:
        lede = (
            f"{display} was a coin-flip picker who still finished first among the original four on hit rate. "
            f"The hole is not 'bad at football.' It is three leaks: the road (172 away picks, -16.12u), "
            f"mid-range 4-6.5 spreads (-17.72u), and a handful of teams you would not quit."
        )
        keep = [
            "Home underdogs, especially +3 / +3.5 and +7 to +9.5.",
            "Seattle and San Francisco when they are live (18-3 combined).",
            "Fade the family when you actually disagree (59.0%, +6.79u).",
            "Sunday late slates. You are fine after 4:00.",
        ]
        stop = [
            "Defaulting to the road. 172 away tickets is a habit, and it is -16u.",
            "Betting 4-6.5-point games just because they are on the card.",
            "Monday Night Football until a new sample says otherwise (8-14).",
            "Chasing the Chiefs, Jets, Packers, or Commanders.",
        ]

    return {
        "lede": lede,
        "keep": keep,
        "stop": stop,
        "best_teams": best_teams,
        "worst_teams": worst_teams,
        "most_bet": most_bet,
        "best_line": best_line,
        "worst_line": worst_line,
        "best_slot": best_slot,
        "worst_slot": worst_slot,
        "best_w": best_w,
        "worst_w": worst_w,
        "fav": fav,
        "dog": dog,
        "home": home,
        "away": away,
        "first": first,
        "second": second,
        "po": po,
        "o": o,
    }


def build_pdf(a, display, outfile):
    S = styles()
    n = narrative(a, display)
    story = []

    story.append(Paragraph("2025 FAMILY LEAGUE  ·  ATS DEEP DIVE", S["kicker"]))
    story.append(Paragraph(f"{display}", S["h1"]))
    story.append(
        Paragraph(
            "Every graded pick from last year's spreadsheet: sides, lines, teams, kickoff windows, "
            "and whether fading the table actually paid. Super Bowl excluded (never graded).",
            S["body"],
        )
    )

    o = n["o"]
    story.append(
        stat_strip(
            [
                (fmt_rec(o), "Graded record"),
                (f"{o['pct']}%", "ATS win rate"),
                (f"{fmt_u(o['units'])}u", "Season P/L"),
                (f"{a['roi']}%", "ROI (units / bets)"),
            ],
            S,
        )
    )
    story.append(Spacer(1, 8))
    bt, wt = n["best_teams"][0], n["worst_teams"][0]
    story.append(
        stat_strip(
            [
                (f"{bt[0]} {fmt_rec(bt[1])}", f"Best team  {fmt_u(bt[1]['units'])}u"),
                (f"{wt[0]} {fmt_rec(wt[1])}", f"Worst team  {fmt_u(wt[1]['units'])}u"),
                (f"{a['fade']['pct']}%", f"Faded family majority  {fmt_u(a['fade']['units'])}u"),
                (f"{n['worst_line'][0]}", f"Worst line  {fmt_u(n['worst_line'][1]['units'])}u"),
            ],
            S,
        )
    )
    story.append(Spacer(1, 10))
    story.append(Paragraph("The season in one paragraph", S["h3"]))
    story.append(Paragraph(n["lede"], S["body"]))

    story.append(Paragraph("How the year actually felt", S["h2"]))
    story.append(
        Paragraph(
            f"Best week: {n['best_w']['label']} ({fmt_rec(n['best_w'])}, {fmt_u(n['best_w']['units'])}u). "
            f"Worst week: {n['worst_w']['label']} ({fmt_rec(n['worst_w'])}, {fmt_u(n['worst_w']['units'])}u). "
            f"Longest win streak {a['win_streak']}; longest losing streak {a['loss_streak']}. "
            f"Missed picks: {a['missed']}.",
            S["body"],
        )
    )
    story.append(line_chart(a["weekly_labels"], a["cumulative"], "Cumulative units by week", "Units", zero_line=True))
    story.append(Paragraph("Running P/L after each week. Break-even is the zero line.", S["caption"]))
    story.append(bar_chart(a["weekly_labels"], a["weekly_units"], "Weekly units won or lost", "Units"))
    story.append(Paragraph("Green is a winning week; red is a losing week.", S["caption"]))
    story.append(line_chart(a["weekly_labels"], a["weekly_pct"], "Weekly ATS win rate", "Win %", pct=True))
    story.append(
        Paragraph(
            "Pushes count as 0.5. The dashed line is 50%. Break-even ATS at typical -110 juice is about 52.4%.",
            S["caption"],
        )
    )

    half = [
        ["Split", "Record", "Win %", "Units", "Bets"],
        ["Weeks 1-9", fmt_rec(n["first"]), f"{n['first']['pct']}%", f"{fmt_u(n['first']['units'])}u", str(n["first"]["n"])],
        ["Weeks 10-18", fmt_rec(n["second"]), f"{n['second']['pct']}%", f"{fmt_u(n['second']['units'])}u", str(n["second"]["n"])],
        ["Regular season", fmt_rec(a["regular"]), f"{a['regular']['pct']}%", f"{fmt_u(a['regular']['units'])}u", str(a["regular"]["n"])],
        ["Playoffs", fmt_rec(n["po"]), f"{n['po']['pct']}%", f"{fmt_u(n['po']['units'])}u", str(n["po"]["n"])],
    ]
    story.append(simple_table(half[0], half[1:], S, [1.6 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Favorites, dogs, home, and the road", S["h2"]))
    story.append(
        Paragraph(
            "Did you make money on favorites or underdogs?",
            S["q"],
        )
    )
    story.append(
        Paragraph(
            f"Favorites: {fmt_rec(n['fav'])} ({n['fav']['pct']}%, {fmt_u(n['fav']['units'])}u on {n['fav']['n']} bets). "
            f"Underdogs: {fmt_rec(n['dog'])} ({n['dog']['pct']}%, {fmt_u(n['dog']['units'])}u on {n['dog']['n']} bets). "
            f"Home teams you backed: {fmt_rec(n['home'])} ({n['home']['pct']}%, {fmt_u(n['home']['units'])}u). "
            f"Away teams: {fmt_rec(n['away'])} ({n['away']['pct']}%, {fmt_u(n['away']['units'])}u).",
            S["body"],
        )
    )
    story.append(
        grouped_bar(
            ["Favorite", "Underdog", "Home", "Away"],
            [
                ("Win rate", [n["fav"]["pct"], n["dog"]["pct"], n["home"]["pct"], n["away"]["pct"]]),
            ],
            "ATS win rate by side",
            "Win %",
        )
    )
    # grouped_bar with one series looks odd - use bar_chart instead
    story = story[:-1]
    story.append(
        bar_chart(
            ["Favorite", "Underdog", "Home", "Away"],
            [n["fav"]["pct"], n["dog"]["pct"], n["home"]["pct"], n["away"]["pct"]],
            "ATS win rate by side",
            "Win %",
        )
    )
    story.append(Paragraph("Home/away is the team picked, not the favorite's home/away.", S["caption"]))
    story.append(
        bar_chart(
            ["Favorite", "Underdog", "Home", "Away"],
            [n["fav"]["units"], n["dog"]["units"], n["home"]["units"], n["away"]["units"]],
            "Units by side",
            "Units",
        )
    )
    story.append(Paragraph("Units won or lost on each ticket type.", S["caption"]))

    trows = []
    for label, r in a["tickets"].items():
        trows.append([label, fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["n"])])
    story.append(Paragraph("The four classic tickets", S["h3"]))
    story.append(simple_table(["Ticket", "Record", "Win %", "Units", "Bets"], trows, S, [1.8 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Spreads you actually profit on", S["h2"]))
    story.append(
        Paragraph(
            f"Best line: {n['best_line'][0]} ({fmt_rec(n['best_line'][1])}, {fmt_u(n['best_line'][1]['units'])}u). "
            f"Worst line: {n['worst_line'][0]} ({fmt_rec(n['worst_line'][1])}, {fmt_u(n['worst_line'][1]['units'])}u).",
            S["body"],
        )
    )
    line_labels = [k for k in LINE_ORDER if k in a["lines"]]
    story.append(
        bar_chart(
            line_labels,
            [a["lines"][k]["units"] for k in line_labels],
            "Units by the line you took",
            "Units",
            height=3.0,
        )
    )
    story.append(Paragraph("Favorite is a negative number; underdog is positive. Sample sizes vary.", S["caption"]))

    size_order = ["1-2.5", "3-3.5", "4-6.5", "7-9.5", "10+"]
    size_rows = []
    for k in size_order:
        r = a["spread_size"].get(k)
        if not r:
            continue
        size_rows.append([k, fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["n"])])
    story.append(simple_table(["Game spread", "Record", "Win %", "Units", "Bets"], size_rows, S, [1.6 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Teams: who printed, who billed you", S["h2"]))
    story.append(
        Paragraph(
            f"Most money made: {n['best_teams'][0][0]} {fmt_rec(n['best_teams'][0][1])} "
            f"({fmt_u(n['best_teams'][0][1]['units'])}u). "
            f"Most money lost: {n['worst_teams'][0][0]} {fmt_rec(n['worst_teams'][0][1])} "
            f"({fmt_u(n['worst_teams'][0][1]['units'])}u). "
            f"Most-bet team: {n['most_bet'][0]} ({n['most_bet'][1]['n']} bets, "
            f"{fmt_u(n['most_bet'][1]['units'])}u).",
            S["body"],
        )
    )
    top = best_worst(a["team_on"], 8, True)
    bot = best_worst(a["team_on"], 8, False)
    story.append(
        bar_chart(
            [t for t, _ in top],
            [r["units"] for _, r in top],
            "Most profitable teams you backed",
            "Units",
            horizontal=True,
            height=3.1,
        )
    )
    story.append(Paragraph("Top eight teams by units when you bet on them.", S["caption"]))
    story.append(
        bar_chart(
            [t for t, _ in bot],
            [r["units"] for _, r in bot],
            "Teams that cost you the most",
            "Units",
            horizontal=True,
            height=3.1,
        )
    )
    story.append(Paragraph("Bottom eight teams by units when you bet on them.", S["caption"]))

    team_rows = []
    for team, r in sorted(a["team_on"].items(), key=lambda kv: -kv[1]["units"]):
        team_rows.append([team, fmt_rec(r), f"{r['pct']}%", str(r["n"]), f"{fmt_u(r['units'])}u"])
    story.append(Paragraph("Every team you wagered on", S["h3"]))
    story.append(
        simple_table(
            ["Team", "Record", "Win %", "Bets", "Units"],
            team_rows,
            S,
            [1.7 * inch, 1.3 * inch, 1.2 * inch, 1.2 * inch, 1.3 * inch],
        )
    )
    story.append(Spacer(1, 8))

    fade_best = best_worst(a["team_ag"], 5, True)
    fade_worst = best_worst(a["team_ag"], 5, False)
    story.append(Paragraph("Best and worst fades (teams you bet against)", S["h3"]))
    fade_rows = []
    for team, r in fade_best:
        fade_rows.append([f"Fade {team}", fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["n"])])
    for team, r in fade_worst:
        fade_rows.append([f"Fade {team}", fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["n"])])
    story.append(
        simple_table(
            ["Matchup", "Record", "Win %", "Units", "Bets"],
            fade_rows,
            S,
            [1.8 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch],
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            f"Conference of the team you backed: NFC {fmt_rec(a['conf'].get('NFC', rec([])))} "
            f"({fmt_u(a['conf'].get('NFC', rec([]))['units'])}u) vs AFC "
            f"{fmt_rec(a['conf'].get('AFC', rec([])))} ({fmt_u(a['conf'].get('AFC', rec([]))['units'])}u).",
            S["body"],
        )
    )
    div_sorted = sorted(a["div"].items(), key=lambda kv: -kv[1]["units"])
    story.append(
        bar_chart(
            [d for d, _ in div_sorted],
            [r["units"] for _, r in div_sorted],
            "Units by division of the team you backed",
            "Units",
            horizontal=True,
            height=3.0,
        )
    )
    story.append(Paragraph("Division of the team on your ticket, not the opponent.", S["caption"]))

    story.append(Paragraph("Kickoff windows", S["h2"]))
    story.append(
        Paragraph(
            f"Best sizable window: {n['best_slot'][0]} ({fmt_rec(n['best_slot'][1])}, "
            f"{fmt_u(n['best_slot'][1]['units'])}u). "
            f"Worst sizable window: {n['worst_slot'][0]} ({fmt_rec(n['worst_slot'][1])}, "
            f"{fmt_u(n['worst_slot'][1]['units'])}u).",
            S["body"],
        )
    )
    slot_labels = [k for k in SLOT_ORDER if k in a["slots"]]
    story.append(
        bar_chart(
            slot_labels,
            [a["slots"][k]["units"] for k in slot_labels],
            "Units by game window",
            "Units",
            horizontal=True,
            height=3.0,
        )
    )
    story.append(Paragraph("Windows inferred from kickoff day and time in the spreadsheet.", S["caption"]))
    slot_rows = []
    for k in slot_labels:
        r = a["slots"][k]
        slot_rows.append([k, fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["n"])])
    story.append(simple_table(["Window", "Record", "Win %", "Units", "Bets"], slot_rows, S, [1.8 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch]))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"Division games: {fmt_rec(a['div_games'])} ({a['div_games']['pct']}%, "
            f"{fmt_u(a['div_games']['units'])}u on {a['div_games']['n']} bets) vs non-division "
            f"{fmt_rec(a['non_div'])} ({a['non_div']['pct']}%, {fmt_u(a['non_div']['units'])}u).",
            S["body"],
        )
    )

    story.append(Paragraph("You vs the family", S["h2"]))
    story.append(
        Paragraph(
            f"When the rest of the table had a majority and you faded it: "
            f"{fmt_rec(a['fade'])} ({a['fade']['pct']}%, {fmt_u(a['fade']['units'])}u). "
            f"Lone wolf (nobody else matched you): {fmt_rec(a['lone'])} ({a['lone']['pct']}%, {fmt_u(a['lone']['units'])}u). "
            f"Unanimous with the family: {fmt_rec(a['unanimous'])} ({a['unanimous']['pct']}%, {fmt_u(a['unanimous']['units'])}u).",
            S["body"],
        )
    )
    order = ["Logan", "Caleb", "Peter/Sean", "Ben", "Grace"]
    story.append(
        bar_chart(
            order,
            [a["others"][p]["pct"] for p in order],
            "Full-season ATS win rate",
            "Win %",
        )
    )
    story.append(Paragraph("Logan started in Week 5 and missed 67 games, so his rate is a shorter season.", S["caption"]))
    stand_rows = []
    for p in order:
        r = a["others"][p]
        label = "Peter / Sean" if p == "Peter/Sean" else p
        mark = "  <<" if p == a["name"] else ""
        stand_rows.append([label + mark, fmt_rec(r), f"{r['pct']}%", f"{fmt_u(r['units'])}u", str(r["missed"])])
    story.append(simple_table(["Player", "Record", "Win %", "Units", "Missed"], stand_rows, S, [1.8 * inch, 1.3 * inch, 1.2 * inch, 1.4 * inch, 1.2 * inch]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("What this says to do in 2026", S["h2"]))
    story.append(
        Paragraph(
            "These are rules implied by last year's results, not guarantees. Small buckets can swing. "
            "The large-sample leaks are the ones worth changing.",
            S["body"],
        )
    )
    story.append(Paragraph("Keep doing this", S["h3"]))
    for item in n["keep"]:
        story.append(Paragraph(f"•  {item}", S["bullet"]))
    story.append(Paragraph("Stop doing this", S["h3"]))
    for item in n["stop"]:
        story.append(Paragraph(f"•  {item}", S["bullet"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("How the numbers were built", S["h3"]))
    story.append(
        Paragraph(
            "Parsed all 22 week sheets (285 games). A pick counts when the spreadsheet has Favorite/Underdog "
            "and a WINNER (or a recorded P/L). Pushes are 0 units and 0.5 toward win rate, matching the sheet. "
            "Units come from the P/L column next to the player's name. Super Bowl is excluded because it was "
            "never graded. Team names were normalized through the sheet's typos (Cheifs, Cardnials, Ebars, and so on).",
            S["body"],
        )
    )

    OUT_DIR.mkdir(exist_ok=True)
    doc = SimpleDocTemplate(
        str(outfile),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.65 * inch,
        title=f"{display} 2025 ATS Deep Dive",
        author="NFL Pick'ems",
    )
    doc.build(story, onFirstPage=header_footer(display), onLaterPages=header_footer(display))


def main():
    style_mpl()
    games = load_games()
    OUT_DIR.mkdir(exist_ok=True)
    written = []
    for key, display, filename in PLAYERS_OUT:
        a = analyze(games, key)
        path = OUT_DIR / filename
        build_pdf(a, display, path)
        written.append(path)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    return written


if __name__ == "__main__":
    main()
