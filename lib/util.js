module.exports.formatReqForLog = function(req) {
	return {
		path: req.path,
		headers: req.headers,
		body: req.body
	};
};