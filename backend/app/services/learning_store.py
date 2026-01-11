import json
import os
from datetime import datetime
from typing import Dict, Optional, List


DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
REPORTS_FILE = os.path.join(DATA_DIR, 'learning_reports.json')


def _ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(REPORTS_FILE):
        with open(REPORTS_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f)


def save_report(report: Dict) -> Dict:
    """Save a learning report to persistent JSON file."""
    _ensure_data_dir()
    try:
        with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = []

    report_entry = dict(report)
    if 'created_at' not in report_entry:
        report_entry['created_at'] = datetime.utcnow().isoformat()
    data.append(report_entry)

    with open(REPORTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return report_entry


def load_report(report_id: str) -> Optional[Dict]:
    _ensure_data_dir()
    try:
        with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return None

    for r in data:
        if r.get('position_id') == report_id or r.get('id') == report_id:
            return r
    return None


def list_reports(limit: int = 100) -> List[Dict]:
    _ensure_data_dir()
    try:
        with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return []

    return list(reversed(data))[:limit]
