"""What the generator should know about the student before it writes a game for them (numbers and topic names only, no personal data)."""
import roadmap


def build(user) -> dict:
    st = roadmap.stats(user)
    ad = roadmap.adaptation(user)
    return {"level": st["level"], "difficulty": ad["difficulty"], "style": ad["style"], "accuracy": st["accuracy"], "answers": st["answers"],
            "known": [t["name"] for t in st["strong"]][:12], "weak": [t["name"] for t in st["weak"]][:8]}


def prompt_block(p) -> str:
    if not p:
        return ""
    lines = [f"\nStudent context (personalise the teaching, but stay faithful to the material and never invent facts): player level {p['level']}, "
             f"difficulty setting {p['difficulty']} of 5 ({p['style']} style)" + (f", typical accuracy {p['accuracy']}%." if p.get("accuracy") is not None and p.get("answers", 0) >= 10 else ".")]
    if p.get("known"):
        lines.append("Topics this student already knows well (give them only a brief recap and spend the questions elsewhere): " + "; ".join(p["known"]) + ".")
    if p.get("weak"):
        lines.append("Topics this student struggles with (if the material touches them, explain slowly with a concrete example and add extra easier questions): " + "; ".join(p["weak"]) + ".")
    d = p["difficulty"]
    if d >= 4:
        lines.append("Make most questions 'apply' or 'analyze' skill (cases, comparisons, why/what-if), with plausible distractors.")
    elif d <= 2:
        lines.append("Make most questions 'recall' or 'understand' skill with short, clear wording and one obviously wrong option.")
    else:
        lines.append("Mix recall, understand and apply questions evenly.")
    return " ".join(lines) + "\n"
