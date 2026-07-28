import unittest

from app import fetch_all_grades, normalize_course, parse_grade_components


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.pages = []

    def post(self, _url, data, **_kwargs):
        page = int(data["queryModel.currentPage"])
        self.pages.append(page)
        start = (page - 1) * 50
        count = 50 if page == 1 else 13
        rows = [{"key": f"grade-{index}", "kcmc": f"课程{index}"} for index in range(start, start + count)]
        return FakeResponse({"items": rows, "records": 63})


class WebAppTests(unittest.TestCase):
    def test_course_normalizer_preserves_schedule_fields(self):
        course = normalize_course({
            "kcmc": "数据结构与算法",
            "xqj": "2",
            "jc": "第3-4节",
            "cdmc": "1-314",
            "xm": "陈老师",
            "zcd": "1-16周",
        }, 0)
        self.assertEqual(course["name"], "数据结构与算法")
        self.assertEqual(course["day"], "周二")
        self.assertEqual(course["time"], "第 3-4 节")
        self.assertEqual(course["location"], "1-314")

    def test_grade_pagination_reads_every_record_once(self):
        session = FakeSession()
        rows = fetch_all_grades(session, "2025", "12")
        self.assertEqual(len(rows), 63)
        self.assertEqual(session.pages, [1, 2])
        self.assertEqual(len({row["key"] for row in rows}), 63)

    def test_grade_detail_parser_reads_weights_and_scores(self):
        html = """
        <table><tbody>
          <tr><td>【 平时成绩 】</td><td>40%</td><td>98.65</td></tr>
          <tr><td>【 期末成绩 】</td><td>60%</td><td>96</td></tr>
          <tr><td>【 总评 】</td><td></td><td>97</td></tr>
        </tbody></table>
        """
        self.assertEqual(parse_grade_components(html), [
            {"label": "平时成绩", "value": "98.65", "weight": "40%"},
            {"label": "期末成绩", "value": "96", "weight": "60%"},
            {"label": "总评", "value": "97", "weight": ""},
        ])


if __name__ == "__main__":
    unittest.main()
