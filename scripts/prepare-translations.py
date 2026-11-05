"""Build offline language resource patches from the source catalog.

Only checked-in interface copy is submitted for translation. Never read account
data, configuration paths, credentials or runtime text. Translations are cached
as generated artifacts and never requested by the application at runtime.
"""
import concurrent.futures
import difflib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / "src/locales/zh-CN.json").read_text(encoding="utf-8"))
CACHE = ROOT / "output/i18n-translations-v2"
CACHE.mkdir(parents=True, exist_ok=True)
LANGUAGES = ["en", "fr", "ru", "ja", "vi", "zh-TW"]
TOKEN = re.compile(r"\{\{[^{}]+\}\}")
PROTECTED = re.compile(r"\{\{[^{}]+\}\}|(?:https?://|~/)[^\s，。；（）]+|\b(?:ChatGPT|Codex|Claude Code|Claude|WorkBuddy|Accio Work|AccioWork|OpenAI|Anthropic|AI Helper|GitHub|Google|Discord|LinuxDO|DeepSeek|Node\.js|npm|Windows|macOS|Linux|API Key|Base URL|Bridge|OAuth|WebAuthn|Passkey|TOTP|Turnstile|Sora|Prompt Caching|Extended Thinking)\b|\b[A-Za-z_][A-Za-z0-9_]*[._][A-Za-z0-9_.]+\b|\b(?:gpt|claude|deepseek)-[A-Za-z0-9.-]+\b")

OVERRIDES = {
    "en": {"settings.title": "Settings", "settings.language": "Interface language", "nav.workspace": "Workspace", "nav.models": "Models", "nav.keys": "API Keys", "nav.account": "Account", "nav.tools": "Tools & Environment", "common.reload": "Reload", "common.open": "Open", "common.next": "Next", "common.previous": "Back", "common.cancel": "Cancel", "common.save": "Save", "common.refresh": "Refresh", "common.close": "Close", "account.topup": "Top up", "settings.general": "General", "settings.appearance": "Appearance", "settings.about": "About", "settings.checkUpdates": "Check for updates", "common.paste": "Paste"},
    "fr": {"settings.title": "Paramètres", "settings.language": "Langue de l’interface", "nav.workspace": "Espace de travail", "nav.models": "Modèles", "nav.keys": "Clés API", "nav.account": "Compte", "nav.tools": "Outils et environnement", "common.reload": "Recharger", "common.next": "Suivant", "common.previous": "Retour", "settings.general": "Général", "settings.appearance": "Apparence", "settings.about": "À propos"},
    "ru": {"settings.title": "Настройки", "settings.language": "Язык интерфейса", "nav.workspace": "Рабочая область", "nav.models": "Модели", "nav.keys": "Ключи API", "nav.account": "Аккаунт", "nav.tools": "Инструменты и среда", "common.reload": "Перезагрузить", "common.next": "Далее", "common.previous": "Назад", "settings.general": "Общие", "settings.appearance": "Оформление", "settings.about": "О программе"},
    "ja": {"settings.title": "設定", "settings.language": "表示言語", "nav.workspace": "ワークスペース", "nav.models": "モデル", "nav.keys": "API キー", "nav.account": "アカウント", "nav.tools": "ツールと環境", "common.reload": "再読み込み", "common.next": "次へ", "common.previous": "戻る", "settings.general": "一般", "settings.appearance": "外観", "settings.about": "このアプリについて"},
    "vi": {"settings.title": "Cài đặt", "settings.language": "Ngôn ngữ giao diện", "nav.workspace": "Không gian làm việc", "nav.models": "Mô hình", "nav.keys": "Khóa API", "nav.account": "Tài khoản", "nav.tools": "Công cụ và môi trường", "common.reload": "Tải lại", "common.next": "Tiếp theo", "common.previous": "Quay lại", "settings.general": "Chung", "settings.appearance": "Giao diện", "settings.about": "Giới thiệu"},
    "zh-TW": {"settings.title": "設定", "settings.language": "介面語言", "nav.workspace": "工作台", "nav.models": "模型廣場", "nav.keys": "金鑰管理", "nav.account": "個人中心", "nav.tools": "工具與環境", "common.reload": "重新載入", "common.next": "下一步", "common.previous": "上一步", "settings.general": "一般", "settings.appearance": "外觀", "settings.about": "關於"},
}


def translate_batch(language, batch, number):
    saved = CACHE / f"{language}-{number:03d}.json"
    if saved.exists():
        existing = json.loads(saved.read_text(encoding="utf-8"))
        if set(existing) == {key for key, _ in batch}:
            return existing
    queries = []
    tokens = []
    for key, value in batch:
        current = PROTECTED.findall(value)
        tokens.append(current)
        current_index = iter(range(len(current)))
        value = PROTECTED.sub(lambda _: f"ZPH{next(current_index)}ZZ", value)
        queries.append(("q", value))
    encoded = urllib.parse.urlencode([("client", "dict-chrome-ex"), ("sl", "zh-CN"), ("tl", language)] + queries)
    url = "https://clients5.google.com/translate_a/t?" + encoded
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            values = json.loads(urllib.request.urlopen(req, timeout=25).read())
            if len(values) != len(batch) or not all(isinstance(v, str) for v in values):
                raise ValueError("Unexpected translation response")
            result = {}
            for (key, source), value, placeholders in zip(batch, values, tokens):
                for index, token in enumerate(placeholders):
                    value = re.sub(rf"ZPH\s*{index}\s*ZZ", lambda _: token, value, flags=re.I)
                if sorted(TOKEN.findall(value)) != sorted(TOKEN.findall(source)):
                    raise ValueError(f"Interpolation changed: {key}")
                result[key] = value
            saved.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return result
        except Exception:
            if attempt == 3:
                raise
            time.sleep(attempt + 1)


def build(language):
    batches, batch, size = [], [], 0
    for item in CATALOG.items():
        cost = len(urllib.parse.quote(item[1])) + 12
        if batch and (size + cost > 5700 or len(batch) >= 35):
            batches.append(batch)
            batch, size = [], 0
        batch.append(item)
        size += cost
    if batch:
        batches.append(batch)
    result = {}
    for index, batch in enumerate(batches):
        result.update(translate_batch(language, batch, index))
        if index % 10 == 0:
            print(f"{language}: {index + 1}/{len(batches)} batches", flush=True)
    result.update({key: value for key, value in OVERRIDES.get(language, {}).items() if key in CATALOG})
    if set(result) != set(CATALOG):
        raise ValueError(f"Catalog mismatch: {language}")
    entries = list(result.items())
    patch_dir = ROOT / "output/i18n-patches"
    existing_file = ROOT / f"src/locales/{language}.json"
    if existing_file.exists():
        before = existing_file.read_text(encoding="utf-8")
        after = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        diff = list(difflib.unified_diff(before.splitlines(), after.splitlines(), n=2, lineterm=""))[2:]
        body = f'*** Update File: src/locales/{language}.json\n' + "\n".join("@@" if line.startswith("@@") else line for line in diff) + "\n"
        (patch_dir / f"{language}-complete.patch").write_text("*** Begin Patch\n" + body + "*** End Patch\n", encoding="utf-8")
        print(f"{language}: complete, {len(result)} keys", flush=True)
        return
    for offset in range(0, len(entries), 120):
        lines = "\n".join("+  " + json.dumps(key) + ": " + json.dumps(value, ensure_ascii=False) + "," for key, value in entries[offset:offset + 120] if key != "catalog.version")
        target = f"src/locales/{language}.json"
        existing_file = ROOT / target
        if existing_file.exists():
            chunk_keys = {key for key, _ in entries[offset:offset + 120]}
            previous = json.loads(existing_file.read_text(encoding="utf-8"))
            updated = {**previous, **{key: result[key] for key in chunk_keys}}
            before = existing_file.read_text(encoding="utf-8")
            after = json.dumps(updated, ensure_ascii=False, indent=2) + "\n"
            diff = list(difflib.unified_diff(before.splitlines(), after.splitlines(), n=2, lineterm=""))[2:]
            body = f'*** Update File: {target}\n' + "\n".join("@@" if line.startswith("@@") else line for line in diff) + "\n"
        elif offset == 0:
            body = f'*** Add File: {target}\n+{{\n{lines}\n+  "catalog.version": "1"\n+}}\n'
        else:
            body = f'*** Update File: {target}\n@@\n{lines}\n   "catalog.version": "1"\n'
        (patch_dir / f"{language}-{offset:04d}.patch").write_text("*** Begin Patch\n" + body + "*** End Patch\n", encoding="utf-8")
    print(f"{language}: complete, {len(result)} keys", flush=True)


if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(build, LANGUAGES))
