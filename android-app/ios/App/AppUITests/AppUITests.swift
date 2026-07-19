import XCTest

final class AppUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        XCTAssertTrue(launchHome(), "首页连续两次启动均未能正常加载")
    }

    func testCorePagesAndLocalCourseFlow() throws {
        let allCoursesButton = app.buttons["全部课表"]
        XCTAssertTrue(allCoursesButton.waitForExistence(timeout: 15), "首页课程入口未完成加载")
        capture("01-home")

        let backButton = app.buttons["返回首页"]
        for _ in 0..<2 {
            app.buttons["全部课表"].tap()
            if backButton.waitForExistence(timeout: 8) {
                break
            }
        }
        XCTAssertTrue(backButton.exists, "未进入全部课表页面")
        XCTAssertTrue(app.buttons["添加课程"].exists)
        capture("02-timetable")

        app.buttons["添加课程"].tap()
        XCTAssertTrue(app.staticTexts["添加课程"].waitForExistence(timeout: 5))

        XCTAssertGreaterThanOrEqual(app.textFields.count, 4, "添加课程表单字段不完整")
        let nameField = textField(placeholder: "例如：高等数学")
        let locationField = textField(placeholder: "例如：教学楼 A205")
        XCTAssertTrue(nameField.exists)
        XCTAssertTrue(locationField.exists)
        nameField.tap()
        nameField.typeText("UI Test Course")
        locationField.tap()
        locationField.typeText("A101")
        app.staticTexts["添加课程"].tap()
        app.buttons["保存课程"].tap()

        let savedCourse = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", "UI Test Course")
        ).firstMatch
        XCTAssertTrue(savedCourse.waitForExistence(timeout: 10), "课程保存后未显示在课表中")
        capture("03-course-added")

        app.terminate()
        Thread.sleep(forTimeInterval: 2)
        XCTAssertTrue(launchHome(), "保存课程后重新启动应用失败")

        let syncButton = app.buttons["同步"]
        XCTAssertTrue(syncButton.waitForExistence(timeout: 10), "首页底部导航未显示同步入口")
        syncButton.tap()
        XCTAssertTrue(app.staticTexts["同步课表"].waitForExistence(timeout: 10), "未进入同步课表页面")
        XCTAssertTrue(app.staticTexts["非官方学生工具。密码仅用于本次连接且不会保存；课表与同步记录只保存在本机。"].exists)

        app.buttons["隐私说明"].tap()
        XCTAssertTrue(app.staticTexts["隐私说明"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["课序是学生个人开发的非官方课程表工具，与学校不存在隶属或授权关系。"].exists)
        capture("04-privacy")
        app.buttons["我已了解"].tap()
        XCTAssertTrue(app.staticTexts["同步课表"].waitForExistence(timeout: 10), "隐私说明关闭后未返回同步页面")

        let settingsButton = app.buttons["设置"]
        XCTAssertTrue(settingsButton.waitForExistence(timeout: 10), "同步页面底部导航未显示设置入口")
        settingsButton.tap()
        XCTAssertTrue(app.staticTexts["课序 0.5.2"].waitForExistence(timeout: 10), "未进入设置页面")
        XCTAssertTrue(app.staticTexts["隐私与非官方说明"].exists)
        capture("05-settings")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func textField(placeholder: String) -> XCUIElement {
        app.textFields.matching(
            NSPredicate(format: "placeholderValue == %@", placeholder)
        ).firstMatch
    }

    private func launchHome() -> Bool {
        for _ in 0..<2 {
            app.launch()
            if app.buttons["首页"].waitForExistence(timeout: 25) {
                return true
            }
            app.terminate()
            Thread.sleep(forTimeInterval: 2)
        }
        return false
    }
}
