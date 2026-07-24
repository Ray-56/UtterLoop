# Local-first DDD Web Architecture

UtterLoop starts as a static Web app hosted on GitHub Pages, with learning data stored locally in the browser. We separate domain rules from React and IndexedDB by using `domain`, `application`, `infrastructure`, and `presentation` layers, because the core practice and review model should survive future changes such as account sync, AI services, or a hosted backend.
