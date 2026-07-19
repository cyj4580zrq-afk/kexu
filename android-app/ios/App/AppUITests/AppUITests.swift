import XCTest

final class AppUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launch()
        XCTAssertTrue(app.buttons["首页"].waitForExistence(timeout: 20), "首页未能正常加载")
    }

    func testCorePagesAndLocalCourseFlow() throws {
        XCTAssertTrue(app.staticTexts["把时间留给自己"].exists)
        capture("01-home")

        app.buttons["查看全部课程"].tap()
        XCTAssertTrue(app.staticTexts["全部课表"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["添加课程"].exists)
        capture("02-timetable")

        app.buttons["添加课程"].tap()
        XCTAssertTrue(app.staticTexts["添加课程"].waitForExistence(timeout: 5))

        let fields = app.textFields
        XCTAssertGreaterThanOrEqual(fields.count, 4, "添加课程表单字段不完整")
        fields.element(boundBy: 0).tap()
        fields.element(boundBy: 0).typeText("模拟测试课程")
        fields.element(boundBy: 2).tap()
        fields.element(boundBy: 2).typeText("测试教室 A101")
        app.buttons["保存课程"].tap()

        XCTAssertTrue(app.staticTexts["模拟测试课程"].waitForExistence(timeout: 5), "课程保存后未显示在课表中")
        capture("03-course-added")

        app.buttons["返回首页"].tap()
        app.buttons["同步"].tap()
        XCTAssertTrue(app.staticTexts["同步课表"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["非官方学生工具。密码仅用于本次连接且不会保存；课表与同步记录只保存在本机。"].exists)

        app.buttons["隐私说明"].tap()
        XCTAssertTrue(app.staticTexts["隐私说明"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["课序是学生个人开发的非官方课程表工具，与学校不存在隶属或授权关系。"].exists)
        capture("04-privacy")
        app.buttons["我已了解"].tap()

        app.buttons["设置"].tap()
        XCTAssertTrue(app.staticTexts["设置"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["隐私与非官方说明"].exists)
        XCTAssertTrue(app.staticTexts["课序 0.5.2"].exists)
        capture("05-settings")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
