'use strict';

const { handler: patchSessionFeedbackHandler } = require('./patch-session-feedback.js');

exports.handler = async (event, context) => {
    return patchSessionFeedbackHandler(event, context);
};
