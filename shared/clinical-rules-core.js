// ExerciseApp/shared/clinical-rules-core.js

if (typeof require === 'function' && typeof module !== 'undefined' && module.exports) {
    module.exports = require('./clinical-core/index.js');
} else {
    // Legacy browser import path - actual core is loaded from shared/clinical-core/index.js.
}
