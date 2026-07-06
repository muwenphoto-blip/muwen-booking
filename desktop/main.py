#!/usr/bin/env python3
"""沐紋映像｜預約後台 — Mac 桌面版（雙擊開啟，不用自己開瀏覽器）"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PyQt6.QtCore import QLocale, QUrl
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QVBoxLayout,
)

try:
    from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except ImportError:
    QWebEnginePage = None
    QWebEngineProfile = None
    QWebEngineView = None

APP_NAME = "沐紋映像預約後台"
APP_VERSION = "1.0"
APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
CONFIG_DIR = Path.home() / ".muwen-booking"
CONFIG_FILE = CONFIG_DIR / "config.json"
WEB_DATA_DIR = CONFIG_DIR / "webview"
URL_FILE = PROJECT_DIR / "admin" / "後台網址.txt"


def load_url_from_txt() -> str:
    if not URL_FILE.is_file():
        return ""
    for line in URL_FILE.read_text(encoding="utf-8").splitlines():
        text = line.split("#", 1)[0].strip()
        if text.startswith("http"):
            return text
    return ""


def load_config() -> dict:
    if CONFIG_FILE.is_file():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if data.get("admin_url", "").startswith("http"):
                return data
        except json.JSONDecodeError:
            pass
    url = load_url_from_txt()
    if url:
        save_config(url)
        return {"admin_url": url}
    return {}


def save_config(admin_url: str) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps({"admin_url": admin_url}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def ask_admin_url(parent=None) -> str:
    dialog = QDialog(parent)
    dialog.setWindowTitle("設定後台網址")
    layout = QVBoxLayout(dialog)
    form = QFormLayout()
    url_input = QLineEdit(load_url_from_txt())
    url_input.setPlaceholderText("https://muwen-booking.vercel.app/admin")
    form.addRow("後台網址：", url_input)
    layout.addLayout(form)
    buttons = QDialogButtonBox(
        QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
    )
    buttons.button(QDialogButtonBox.StandardButton.Ok).setText("確定")
    buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("取消")
    buttons.accepted.connect(dialog.accept)
    buttons.rejected.connect(dialog.reject)
    layout.addWidget(buttons)
    if dialog.exec() != QDialog.DialogCode.Accepted:
        return ""
    url = url_input.text().strip()
    if not url.startswith("http"):
        QMessageBox.warning(parent, APP_NAME, "網址格式不正確。")
        return ""
    if "/admin" not in url and "page=admin" not in url:
        if url.endswith("/exec"):
            url += "?page=admin"
        elif "/exec?" not in url and "vercel.app" not in url:
            url = re.sub(r"/exec/?$", "/exec?page=admin", url)
    save_config(url)
    return url


class AdminWindow(QMainWindow):
    def __init__(self, admin_url: str) -> None:
        super().__init__()
        self.admin_url = admin_url
        self.setWindowTitle(APP_NAME)
        self.resize(1180, 760)

        WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.view = QWebEngineView(self)
        profile = QWebEngineProfile("muwen-booking-admin", self.view)
        profile.setPersistentStoragePath(str(WEB_DATA_DIR))
        profile.setCachePath(str(WEB_DATA_DIR / "cache"))
        profile.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies
        )
        profile.setHttpAcceptLanguage("zh-TW,zh;q=0.9,en;q=0.1")
        page = QWebEnginePage(profile, self.view)
        self.view.setPage(page)
        self.setCentralWidget(self.view)
        self.view.load(QUrl(admin_url))

        refresh_action = QAction("重新整理", self)
        refresh_action.triggered.connect(self.view.reload)
        self.menuBar().addAction(refresh_action)

        settings_action = QAction("更改網址", self)
        settings_action.triggered.connect(self.change_url)
        self.menuBar().addAction(settings_action)

    def change_url(self) -> None:
        url = ask_admin_url(self)
        if url:
            self.admin_url = url
            self.view.load(QUrl(url))


def main() -> int:
    QLocale.setDefault(QLocale(QLocale.Language.Chinese, QLocale.Country.Taiwan))
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    if QWebEngineView is None:
        QMessageBox.critical(
            None,
            APP_NAME,
            "缺少 PyQt6-WebEngine。\n請在 desktop 資料夾執行：\n"
            "python3 -m venv .venv && source .venv/bin/activate\n"
            "pip install -r requirements.txt",
        )
        return 1

    config = load_config()
    admin_url = config.get("admin_url", "")
    if not admin_url:
        admin_url = ask_admin_url()
    if not admin_url:
        return 0

    window = AdminWindow(admin_url)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
