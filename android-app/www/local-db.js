(() => {
  const DATABASE = "kexu";

  class KexuLocalDatabase {
    constructor() {
      this.plugin = null;
      this.enabled = false;
    }

    async initialize(seed) {
      if (!window.Capacitor?.isNativePlatform() || !window.capacitorExports?.registerPlugin) return null;
      this.plugin = window.capacitorExports.registerPlugin("CapacitorSQLite");
      try {
        await this.plugin.createConnection({ database: DATABASE, version: 1, encrypted: false, mode: "no-encryption", readonly: false });
      } catch (_error) {
        // The bridge retains an open connection while the WebView is alive.
      }
      await this.plugin.open({ database: DATABASE, readonly: false });
      await this.plugin.execute({ database: DATABASE, transaction: true, statements: this.schema() });
      this.enabled = true;

      const migrated = await this.getMeta("migration_v1");
      if (!migrated) {
        await this.saveCourses(seed.courses || []);
        await this.saveGrades(seed.grades || []);
        await this.saveSyncHistory(seed.syncHistory || []);
        await this.saveGradeHistory(seed.gradeHistory || []);
        await this.setMeta("migration_v1", new Date().toISOString());
      }
      return this.loadAll();
    }

    schema() {
      return `
        CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS courses (
          id TEXT PRIMARY KEY NOT NULL, semester TEXT, source_id TEXT, name TEXT NOT NULL,
          teacher TEXT, weekday INTEGER, start_section INTEGER, end_section INTEGER,
          weeks TEXT, location TEXT, color TEXT, source TEXT, payload TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_courses_semester_day ON courses(semester, weekday);
        CREATE TABLE IF NOT EXISTS grades (
          id TEXT PRIMARY KEY NOT NULL, semester TEXT NOT NULL, course_code TEXT, class_id TEXT,
          name TEXT NOT NULL, teacher TEXT, score TEXT, gpa TEXT, credit TEXT, course_type TEXT,
          exam_type TEXT, payload TEXT NOT NULL, imported_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_semester_class ON grades(semester, class_id, id);
        CREATE TABLE IF NOT EXISTS grade_components (
          id INTEGER PRIMARY KEY AUTOINCREMENT, grade_id TEXT NOT NULL, label TEXT NOT NULL,
          score TEXT, weight TEXT
        );
        CREATE TABLE IF NOT EXISTS sync_history (
          id TEXT PRIMARY KEY NOT NULL, sync_type TEXT, semester TEXT, synced_at TEXT,
          record_count INTEGER, payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS grade_history (
          id TEXT PRIMARY KEY NOT NULL, semester TEXT, synced_at TEXT, record_count INTEGER,
          payload TEXT NOT NULL
        );
      `;
    }

    async query(statement, values = []) {
      const result = await this.plugin.query({ database: DATABASE, statement, values });
      return result.values || [];
    }

    async run(statement, values = []) {
      return this.plugin.run({ database: DATABASE, statement, values, transaction: true });
    }

    async getMeta(key) {
      const rows = await this.query("SELECT value FROM app_meta WHERE key = ?", [key]);
      return rows[0]?.value || "";
    }

    async setMeta(key, value) {
      await this.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)", [key, value]);
    }

    async replace(table, records, mapper) {
      await this.run(`DELETE FROM ${table}`);
      for (const record of records) {
        const entry = mapper(record);
        await this.run(entry.statement, entry.values);
      }
    }

    async saveCourses(courses) {
      await this.replace("courses", courses, course => {
        const sections = String(course.time || "").match(/(\d+)(?:\s*-\s*(\d+))?/);
        const weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].indexOf(course.day) + 1;
        return {
          statement: `INSERT INTO courses (id, semester, source_id, name, teacher, weekday, start_section, end_section, weeks, location, color, source, payload, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          values: [
            String(course.id), course.semester || "", course.sourceId || "", course.name || "未命名课程",
            course.teacher || "", weekday || null, sections ? Number(sections[1]) : null, sections ? Number(sections[2] || sections[1]) : null,
            course.weekRange || "", course.location || "", course.color || "", course.source || "manual",
            JSON.stringify(course), new Date().toISOString()
          ]
        };
      });
    }

    async saveGrades(grades) {
      await this.replace("grades", grades, grade => ({
        statement: `INSERT INTO grades (id, semester, course_code, class_id, name, teacher, score, gpa, credit, course_type, exam_type, payload, imported_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          String(grade.id), grade.semester || "", grade.remote?.courseCode || "", grade.remote?.jxbId || "",
          grade.name || "未知课程", grade.teacher || "", String(grade.score ?? ""), String(grade.gpa ?? ""),
          String(grade.credit ?? ""), grade.courseType || "", grade.examType || "", JSON.stringify(grade), new Date().toISOString()
        ]
      }));
      await this.replace("grade_components", grades.flatMap(grade => (grade.components || []).map((component, index) => ({
        id: `${grade.id}-${index}`, gradeId: String(grade.id), ...component
      }))), component => ({
        statement: "INSERT INTO grade_components (grade_id, label, score, weight) VALUES (?, ?, ?, ?)",
        values: [component.gradeId, component.label || "成绩", String(component.value ?? ""), component.weight || ""]
      }));
    }

    async saveSyncHistory(records) {
      await this.replace("sync_history", records, record => ({
        statement: "INSERT INTO sync_history (id, sync_type, semester, synced_at, record_count, payload) VALUES (?, ?, ?, ?, ?, ?)",
        values: [String(record.id), record.source || "school", record.semester || "", record.syncedAt || "", Number(record.courseCount) || 0, JSON.stringify(record)]
      }));
    }

    async saveGradeHistory(records) {
      await this.replace("grade_history", records, record => ({
        statement: "INSERT INTO grade_history (id, semester, synced_at, record_count, payload) VALUES (?, ?, ?, ?, ?)",
        values: [String(record.id), record.semester || "", record.syncedAt || "", Number(record.gradeCount) || 0, JSON.stringify(record)]
      }));
    }

    async loadAll() {
      const [courses, grades, syncHistory, gradeHistory] = await Promise.all([
        this.query("SELECT payload FROM courses ORDER BY updated_at DESC"),
        this.query("SELECT payload FROM grades ORDER BY imported_at DESC"),
        this.query("SELECT payload FROM sync_history ORDER BY synced_at DESC"),
        this.query("SELECT payload FROM grade_history ORDER BY synced_at DESC")
      ]);
      const parse = rows => rows.map(row => {
        try { return JSON.parse(row.payload); } catch (_error) { return null; }
      }).filter(Boolean);
      return { courses: parse(courses), grades: parse(grades), syncHistory: parse(syncHistory), gradeHistory: parse(gradeHistory) };
    }
  }

  window.KexuLocalDatabase = KexuLocalDatabase;
})();
