# Independent Courses and Versioned Catalog Bundles

UtterLoop treats every `Course` as independently discoverable. A `LearningPath` only contributes recommendation order; it does not own or hide Courses. Catalog discovery metadata (`CourseCategory`, tags, CEFR range, and provider) therefore belongs to the Course catalog and is persisted with it.

IndexedDB schema version 2 adds Course categories and Course discovery indexes. Portable Course bundles use an explicit `schemaVersion: 2` envelope and include Categories, LearningPaths, Courses, and SentenceCards. Earlier unversioned bundle shapes are rejected instead of migrated because the product does not require legacy compatibility.

This keeps search and filtering local-first, makes standalone and imported Courses visible, and avoids coupling curriculum ownership to a recommended learning route. The cost is an intentional one-time bundle-format break and the requirement that future catalog schema changes introduce another explicit version.
