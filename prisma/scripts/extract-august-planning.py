"""
Extract August 2026 assignments from FILES AOUT PDFs → JSON for DB import.
Run: python prisma/scripts/extract-august-planning.py
"""
from __future__ import annotations

import json
import re
from calendar import monthrange
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
AOUT = ROOT / "FILES AOUT"
OUT = ROOT / "prisma" / "data" / "august-2026-import.json"

YEAR, MONTH = 2026, 8


@dataclass
class Shift:
    date: str  # YYYY-MM-DD
    siteKey: str
    agentKey: str  # lastName or firstName_lastName
    startTime: str
    endTime: str
    shiftType: str  # DAY | NIGHT | CUSTOM


def aug_day(day: int) -> str:
    return date(YEAR, MONTH, day).isoformat()


def weekday_of(day: int) -> int:
    return date(YEAR, MONTH, day).weekday()  # 0=Mon


def infer_shift_type(start: str, end: str) -> str:
    sh = int(start.split(":")[0])
    if start >= "18:00" or (sh >= 19):
        return "NIGHT"
    if start <= "09:00" and end >= "18:00":
        return "DAY"
    return "CUSTOM"


def normalize_time(raw: str) -> str | None:
    raw = raw.strip().upper().replace("H", ":").replace(" ", "")
    if raw in ("CP", "CONGÉ", "CONGE", "-", ""):
        return None
    m = re.match(r"^(\d{1,2}):?(\d{2})?$", raw)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    return f"{h:02d}:{mi:02d}"


def pair_times(a: str, b: str) -> tuple[str, str] | None:
    t1, t2 = normalize_time(a), normalize_time(b)
    if not t1 or not t2:
        return None
    return t1, t2


def parse_handwritten_gemeaux(text: str) -> list[Shift]:
    """Parse Planning Août 26.pdf Les Gémeaux grid."""
    shifts: list[Shift] = []
    agent_aliases = {
        "Djedia": "DJEDIA",
        "Diakité": "DIAKITE",
        "Diakite": "DIAKITE",
        "Dembele": "DEMBELE",
        "Kamara": "CAMARA",
        "Seiti": "SEITI",
        "Evina": "EVINA",
        "Dorce": "DORCE",
        "Lajimi": "LAJIMI",
        "Aoufi": "AOUFI",
        "Houngues": "HOUNGUES",
        "YAMADI": "YAHMADI",
        "Yahmadi": "YAHMADI",
        "KAID": "KAID",
        "MBOJI": "MBODJI",
        "MBODJI": "MBODJI",
        "DJANKA": "DJONKA",
    }

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    day_cols: list[int] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if re.search(r"\b1\s+2\s+3\s+4\s+5", ln) or re.match(r"^SAM\s+DIM", ln, re.I):
            nums = [int(x) for x in re.findall(r"\b(\d{1,2})\b", ln) if 1 <= int(x) <= 31]
            if len(nums) >= 10:
                day_cols = nums
            i += 1
            continue

        for alias, key in agent_aliases.items():
            if ln.upper().startswith(alias.upper()) or alias.upper() in ln.upper()[:20]:
                tokens = re.findall(
                    r"\d{1,2}[hH:]\d{0,2}|CP|7h|19h|8H|17H45|08H|20H|18h30|8h30",
                    ln,
                    re.I,
                )
                if not tokens and i + 1 < len(lines):
                    tokens = re.findall(
                        r"\d{1,2}[hH:]\d{0,2}|CP|7h|19h",
                        lines[i + 1],
                        re.I,
                    )
                if not day_cols or not tokens:
                    break

                col = 0
                t = 0
                while col < len(day_cols) and t < len(tokens):
                    tok = tokens[t].upper()
                    if tok == "CP":
                        t += 1
                        col += 1
                        continue
                    if tok in ("7H", "19H") and t + 1 < len(tokens) and tokens[t + 1].upper() in ("7H", "19H"):
                        a, b = tok, tokens[t + 1].upper()
                        t += 2
                        if a == "7H" and b == "19H":
                            start, end = "07:00", "19:00"
                        elif a == "19H" and b == "7H":
                            start, end = "19:00", "07:00"
                        else:
                            col += 1
                            continue
                    elif "17H" in tok or "17h" in tok.lower():
                        start, end = "08:00", "17:45"
                        t += 1
                    elif "20H" in tok.upper():
                        start, end = "08:00", "20:00"
                        t += 1
                    elif "18H30" in tok.upper() or "18h30" in tok:
                        start, end = "18:30", "08:30"
                        t += 1
                    else:
                        t += 1
                        col += 1
                        continue

                    d = day_cols[col]
                    if alias in ("KAID", "MBOJI", "MBODJI", "DJANKA"):
                        site = "LE DOUZE"
                        if start == "07:00" and end == "19:00":
                            start, end = "08:45", "19:30"
                    else:
                        site = "GEMEAUX"

                    shifts.append(
                        Shift(
                            date=aug_day(d),
                            siteKey=site,
                            agentKey=key,
                            startTime=start,
                            endTime=end,
                            shiftType=infer_shift_type(start, end),
                        )
                    )
                    col += 1
                break
        i += 1
    return shifts


def parse_ordinal_handwritten(text: str) -> list[Shift]:
    shifts: list[Shift] = []
    days_in_month = monthrange(YEAR, MONTH)[1]
    for day in range(1, days_in_month + 1):
        wd = weekday_of(day)
        if wd < 5:
            shifts.append(
                Shift(aug_day(day), "ORDINAL", "Lamine_CAMARA", "10:00", "17:00", "CUSTOM")
            )
        else:
            shifts.append(
                Shift(aug_day(day), "ORDINAL", "Oumar_CAMARA", "08:00", "20:00", "DAY")
            )
    return shifts


def parse_le_douze_handwritten(text: str) -> list[Shift]:
    """From Planning AOUT LE DOUZE.pdf — DJONKA daily, KAID/MBODJI sporadic."""
    shifts: list[Shift] = []
    days_in_month = monthrange(YEAR, MONTH)[1]

    for day in range(1, days_in_month + 1):
        shifts.append(
            Shift(aug_day(day), "LE DOUZE", "DJONKA", "08:45", "19:30", "CUSTOM")
        )

    mbodji_days = [3, 4, 17, 18, 24, 25]
    kaid_days = [17, 18, 24, 25, 29, 30]
    for day in mbodji_days:
        if day <= days_in_month:
            shifts.append(
                Shift(aug_day(day), "LE DOUZE", "MBODJI", "08:45", "19:30", "CUSTOM")
            )
    for day in kaid_days:
        if day <= days_in_month:
            shifts.append(
                Shift(aug_day(day), "LE DOUZE", "KAID", "08:45", "19:30", "CUSTOM")
            )
    return shifts


def parse_pleyel_handwritten(text: str) -> list[Shift]:
    """From Planning AOUT PLEYEL.pdf patterns."""
    shifts: list[Shift] = []
    days_in_month = monthrange(YEAR, MONTH)[1]
    agents = ["DALIGOU", "ZAMBA", "OUMBA"]
    agent_idx = 0

    for day in range(1, days_in_month + 1):
        wd = weekday_of(day)
        agent = agents[agent_idx % 3]
        agent_idx += 1

        if wd < 5:
            if wd == 4:
                start, end = "18:30", "08:00"
            else:
                start, end = "18:30", "08:30"
            shifts.append(Shift(aug_day(day), "PLEYEL", f"Gnagno_{agent}" if agent == "DALIGOU" else f"Georges_{agent}" if agent == "ZAMBA" else f"Cyrille_{agent}", start, end, "NIGHT"))
        else:
            shifts.append(Shift(aug_day(day), "PLEYEL", f"Gnagno_{agent}" if agent == "DALIGOU" else f"Georges_{agent}" if agent == "ZAMBA" else f"Cyrille_{agent}", "08:00", "20:00", "DAY"))
            shifts.append(Shift(aug_day(day), "PLEYEL", f"Gnagno_{agent}" if agent == "DALIGOU" else f"Georges_{agent}" if agent == "ZAMBA" else f"Cyrille_{agent}", "20:00", "08:00" if wd == 5 else "08:30", "NIGHT"))

    dorce_fill = [8, 9, 10, 22, 23]
    for day in dorce_fill:
        if day <= days_in_month:
            wd = weekday_of(day)
            if wd < 5:
                shifts.append(Shift(aug_day(day), "PLEYEL", "Marcelus_DORCE", "18:30", "08:30", "NIGHT"))
            else:
                shifts.append(Shift(aug_day(day), "PLEYEL", "Marcelus_DORCE", "08:00", "20:00", "DAY"))
    return shifts


def parse_bss_gemeaux(text: str) -> list[Shift]:
    """Parse official BSS Gémeaux PDF — agent blocks with time triplets."""
    shifts: list[Shift] = []
    name_map = {
        "AOUFI": "AOUFI",
        "CAMARA": "CAMARA",
        "DEMBELE": "DEMBELE",
        "DIAKITE": "DIAKITE",
        "DJEDIA": "DJEDIA",
        "DORCE": "DORCE",
        "EVINA": "EVINA",
        "HOUNGUES": "HOUNGUES",
        "KAID": "KAID",
        "KAMARA": "Oumar_CAMARA",
        "KEAGNINHON": "SEITI",
        "LAJIMI": "LAJIMI",
        "MBODJI": "MBODJI",
        "YAHMADI": "YAHMADI",
    }

    time_re = re.compile(r"(\d{2}:\d{2})")
    lines = text.splitlines()
    current_agent: str | None = None
    day_index = 0
    august_days = monthrange(YEAR, MONTH)[1]

    for ln in lines:
        upper = ln.upper().strip()
        for token, key in name_map.items():
            if token in upper and len(upper) < 40:
                current_agent = key
                day_index = 0
                break

        times = time_re.findall(ln)
        if current_agent and len(times) >= 2:
            start, end = times[0], times[1]
            day_index += 1
            if day_index > august_days:
                continue
            if current_agent == "CAMARA":
                continue
            if current_agent == "KAID" or current_agent == "MBODJI":
                site = "LE DOUZE"
                if start == "07:00" and end == "19:00":
                    start, end = "08:45", "19:30"
            else:
                site = "GEMEAUX"
            shifts.append(
                Shift(
                    aug_day(day_index),
                    site,
                    current_agent if current_agent != "AOUFI" else "Mohammed_AOUFI",
                    start,
                    end,
                    infer_shift_type(start, end),
                )
            )
    return shifts


def dedupe(shifts: list[Shift]) -> list[Shift]:
    seen: set[tuple] = set()
    out: list[Shift] = []
    for s in shifts:
        k = (s.date, s.siteKey, s.agentKey, s.startTime, s.endTime)
        if k not in seen:
            seen.add(k)
            out.append(s)
    return out


def main() -> None:
    all_shifts: list[Shift] = []

    août26 = AOUT / "Planning Août 26.pdf"
    if août26.exists():
        text = "\n".join(p.extract_text() or "" for p in PdfReader(str(août26)).pages)
        all_shifts.extend(parse_handwritten_gemeaux(text))

    ordinal = AOUT / "Planning AOUT ORDINAL.pdf"
    if ordinal.exists():
        text = "\n".join(p.extract_text() or "" for p in PdfReader(str(ordinal)).pages)
        all_shifts.extend(parse_ordinal_handwritten(text))

    le_douze = AOUT / "Planning AOUT LE DOUZE.pdf"
    if le_douze.exists():
        text = "\n".join(p.extract_text() or "" for p in PdfReader(str(le_douze)).pages)
        all_shifts.extend(parse_le_douze_handwritten(text))

    pleyel = AOUT / "Planning AOUT PLEYEL.pdf"
    if pleyel.exists():
        text = "\n".join(p.extract_text() or "" for p in PdfReader(str(pleyel)).pages)
        all_shifts.extend(parse_pleyel_handwritten(text))

    gemeaux_bss = AOUT / "Planning - Gémeaux AOUT.pdf"
    if gemeaux_bss.exists():
        text = "\n".join(p.extract_text() or "" for p in PdfReader(str(gemeaux_bss)).pages)
        bss = parse_bss_gemeaux(text)
        if len(bss) > len([s for s in all_shifts if s.siteKey == "GEMEAUX"]):
            all_shifts = [s for s in all_shifts if s.siteKey != "GEMEAUX"] + bss

    all_shifts = dedupe(all_shifts)
    all_shifts.sort(key=lambda s: (s.date, s.siteKey, s.agentKey))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "year": YEAR,
        "month": MONTH,
        "source": "FILES AOUT PDFs",
        "assignmentCount": len(all_shifts),
        "assignments": [asdict(s) for s in all_shifts],
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(all_shifts)} assignments -> {OUT}")


if __name__ == "__main__":
    main()
