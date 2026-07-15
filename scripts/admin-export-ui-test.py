import json
import os
import tempfile

from playwright.sync_api import sync_playwright


def main():
    now = "2026-07-15T10:00:00.000Z"
    report = {
        "ok": True,
        "generatedAt": now,
        "updatedAt": now,
        "consent": {"shownCount": 20, "acceptedCount": 12, "declinedCount": 5, "updatedAt": now},
        "games": {
            "total": 42,
            "byMediaKind": {"anime": 30, "manga": 5, "lightNovel": 3, "galgame": 4},
            "byMode": {"classic": 38, "timed": 4},
            "accuracyBuckets": [0, 0, 1, 2, 4, 7, 10, 9, 6, 3],
            "distributions": [{
                "mediaKind": "anime", "mode": "classic",
                "buckets": [0, 0, 1, 2, 4, 7, 8, 5, 2, 1], "total": 30, "updatedAt": now,
            }],
        },
        "pairs": {
            "scannedPairs": 1205, "totalShown": 420, "totalCorrect": 280, "totalWrong": 140,
            "topPairs": [{
                "mediaKind": "anime", "mode": "classic", "subjectAName": "作品A", "subjectBName": "作品B",
                "scoreA": 8.1, "scoreB": 7.8, "scoreDiffBucket": "0.3-0.5",
                "shownCount": 20, "correctCount": 11, "wrongCount": 9, "accuracy": 55,
            }],
        },
        "storage": {"schemaVersion": 2, "legacyPairCount": 1200, "v2PairRows": 5},
    }
    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome):
        raise RuntimeError("Chrome executable is unavailable")

    with tempfile.TemporaryDirectory(prefix="rating-gate-admin-ui-") as temp_dir:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=chrome, headless=True)
            page = browser.new_page(viewport={"width": 1366, "height": 900}, accept_downloads=True)
            errors = []
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: errors.append(str(error)))

            page.route("**/api/admin/analytics", lambda route: route.fulfill(
                status=200, content_type="application/json", body=json.dumps(report)
            ))
            page.route("**/api/admin/analytics/export?format=json", lambda route: route.fulfill(
                status=200,
                headers={
                    "content-type": "application/json",
                    "content-disposition": 'attachment; filename="rating-gate-analytics-test.json"',
                },
                body=json.dumps({"manifest": {"analyticsSchemaVersion": 2}}),
            ))
            page.route("**/api/admin/analytics/export?format=csv", lambda route: route.fulfill(
                status=200,
                headers={
                    "content-type": "text/csv",
                    "content-disposition": 'attachment; filename="rating-gate-pairs-test.csv"',
                },
                body="era,subjectAId,subjectBId\r\nv2,1,2",
            ))
            page.goto("http://127.0.0.1:5177/#admin")
            page.wait_for_load_state("networkidle")
            page.locator("#admin-token").fill("test-token")
            page.get_by_role("button", name="读取数据").click()
            page.locator("#admin-dashboard").wait_for(state="visible")
            assert "1205 组" in page.locator("#admin-metrics").inner_text()
            assert page.locator("#admin-export-json").is_visible()
            assert page.locator("#admin-export-csv").is_visible()

            with page.expect_download() as json_download:
                page.locator("#admin-export-json").click()
            assert json_download.value.suggested_filename.endswith(".json"), json_download.value.suggested_filename
            with page.expect_download() as csv_download:
                page.locator("#admin-export-csv").click()
            assert csv_download.value.suggested_filename.endswith(".csv"), csv_download.value.suggested_filename

            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(150)
            dimensions = page.evaluate("() => ({ body: document.body.scrollWidth, viewport: innerWidth })")
            assert dimensions["body"] <= dimensions["viewport"] + 1, f"Mobile page overflows: {dimensions}"
            page.screenshot(path=os.path.join(temp_dir, "admin-mobile.png"), full_page=True)
            browser.close()
            if errors:
                raise AssertionError("Browser errors: " + " | ".join(errors))

    print("Admin export UI test passed.")


if __name__ == "__main__":
    main()
