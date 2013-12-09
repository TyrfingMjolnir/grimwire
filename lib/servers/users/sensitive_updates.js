var config = require('../../config');
var db = require('../../db');
var util = require('../../util.js');
var html = require('../../html.js');
var mailer = require('../../email.js');
var bcrypt = require('bcrypt');
var crypto = require('crypto');
var winston = require('winston');

// Users - Sensitive Updates
// =========================
module.exports = function(server) {

	// Sensitive user updates
	// ----------------------
	server.head('/:userId/update', function(req, res) { return res.send(204); });
	server.post('/:userId/update', function (req, res, next) {
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, {errors:{_form:'Request body is required.'}});
		}
		var updates = {}, errors = {};
		if (req.body.email) {
			if (typeof req.body.email != 'string') { errors.email = 'Must be a string.'; }
			else if (req.body.email.split('@').length != 2) { errors.email = 'Invalid email address.';  }
			else if (req.body.email.length > 512) { errors.email = 'Must be 512 characters or less.'; }
			else { updates.email = req.body.email; }
		}
		if (req.body.password) {
			if (typeof req.body.password != 'boolean') { errors.password = 'Must be a boolean.'; }
			else { updates.password = req.body.password; }
		}
		if (Object.keys(errors).length) { return res.send(422, { errors: errors }); }
		if (Object.keys(updates).length === 0) {
			return res.send(422, {errors:{_form:'No valid fields in the request body.'}});
		}

		// Get user
		db.getUser(req.params.userId, function(err, user) {
			if (err) {
				if (err.notfound) { return res.send(404); }
				winston.error('Failed to get user from DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}
			if (!user) return res.send(404);

			// Generate update capability token
			crypto.randomBytes(64, function(err, buf) {
				if (err) {
					winston.error('Failed to generate random bytes', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
					return res.send(500);
				}
				var token = buf.toString('base64').replace(/\//g, '');

				// Store update details in the user db entry
				var userUpdates = {
					sensitive_update_token: token,
					sensitive_update_data: updates
				};
				db.updateUser(req.params.userId, userUpdates, function(err) {
					if (err) {
						if (err.notfound) { return res.send(404); }
						winston.error('Failed to update user in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
						return res.send(500);
					}

					// Send email
					var url = config.url + '/u/'+user.id+'/update/'+token;
					var updatesExplained = [];
					if (updates.email) updatesExplained.push('email to '+updates.email);
					if (updates.password) updatesExplained.push('a new password');
					updatesExplained = updatesExplained.join(', ');
					mailer.sendMail({
						from: 'noreply@'+config.hostname,
						to: user.email,
						subject: user.id+', Update your '+config.hostname+' account',
						text: [
							'To complete the update to your profile, go to '+url,
							'Updates requested: set '+updatesExplained,
							'This message was sent because your profile on '+config.hostname+' has received an update request. If you did not expect this email, please ignore it.'
						].join('\r\n'),
						html: [
							'<p>To complete the update to your profile, go to '+url+'</p>',
							'<p><strong>Updates requested: set '+updatesExplained+'</strong></p>',
							'<p><small>This message was sent because your profile on '+config.hostname+' has received an update request. If you did not expect this email, please ignore it.</small></p>'
						].join('\r\n'),
					}, function(err, response) {
						if (err) {
							winston.error('Failed to send confirmation email', { error: err, inputs: [user.email], request: util.formatReqForLog(req) });
							return res.send(500);
						}

						// Respond
						res.send(204);
					});
				});
			});
		});
	});

	// Sensitive user updates
	// ----------------------
	server.head('/:userId/update/:token', function(req, res) { return res.send(204); });
	server.all('/:userId/update/:token', function (req, res, next) {
		// Get user
		db.getUser(req.params.userId, function(err, user) {
			if (err) {
				if (err.notfound) { return res.send(404); }
				winston.error('Failed to get user from DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
				return res.send(500);
			}
			if (!user) return res.send(404);

			// Check against token
			if (user.sensitive_update_token != req.params.token) {
				return res.send(404);
			}
			if (!user.sensitive_update_data) {
				return res.send(404);
			}

			req.user = user;
			next();
		});
	});
	server.get('/:userId/update/:token', function (req, res, next) {
		// Create html
		var updates = req.user.sensitive_update_data;
		var page_html = html.user_update
			.replace('{EMAIL}', updates.email ? '<p>Email:<br><input name="email" type="text" class="form-control" placeholder="Username" value="'+updates.email+'"></p>' : '')
			.replace('{PASSWORD}', updates.password ? '<p>Password:<br><input name="password" type="password" class="form-control" placeholder="Password"></p>' : '');
		res.send(200, page_html);
	});
	server.post('/:userId/update/:token', function (req, res, next) {
		// Content negotiation
		if (!req.is('json')) {
			return res.send(415);
		}

		// Validate message
		if (!req.body) {
			return res.send(422, {errors:{_form:'Request body is required.'}});
		}
		var updates = {}, errors = {};
		if (req.body.email) {
			if (typeof req.body.email != 'string') { errors.email = 'Must be a string.'; }
			else if (req.body.email.split('@').length != 2) { errors.email = 'Invalid email address.';  }
			else if (req.body.email.length > 512) { errors.email = 'Must be 512 characters or less.'; }
			else { updates.email = req.body.email; }
		}
		if (req.body.password) {
			if (typeof req.body.password != 'string') { errors.password = 'Must be a string.'; }
			else if (req.body.password.length > 256) { errors.password = 'Must be 256 characters or less.'; }
			else { updates.password = req.body.password; }
		}
		if (Object.keys(errors).length) { return res.send(422, { errors: errors }); }
		if (Object.keys(updates).length === 0) {
			return res.send(422, {errors:{_form:'No valid fields in the request body.'}});
		}

		// Encrypt password, if needed
		if (updates.password) {
			bcrypt.genSalt(10, function(err, salt) {
				bcrypt.hash(updates.password, salt, function(err, hash) {
					if (err) {
						winston.error('Failed to encrypt user password.', { error: err, inputs: [updates.password, salt], request: util.formatReqForLog(req) });
						return res.send(500);
					}
					updates.password = hash;
					return updateUser();
				});
			});
		} else {
			return updateUser();
		}

		function updateUser() {
			updates.sensitive_update_token = null;
			updates.sensitive_update_data = null;
			db.updateUser(req.params.userId, updates, function(err) {
				if (err) {
					if (err.notfound) { return res.send(404); }
					winston.error('Failed to update user in DB', { error: err, inputs: [req.params.userId], request: util.formatReqForLog(req) });
					return res.send(500);
				}

				// Respond
				res.send(204);
			});
		}
	});
};