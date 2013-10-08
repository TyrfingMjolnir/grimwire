var fs = require('fs');
module.exports = {
	dashboard: '',
	login_or_signup: '',
	login: '',
	app_auth: '',
	load: function(config) {
		var welcome = fs.readFileSync('./welcome.html').toString();
		var motd = fs.readFileSync('./motd.html').toString();
		var avatars = fs.readdirSync('./static/img/avatars');

		this.dashboard = fs.readFileSync('./static/dashboard.html').toString()
			.replace(/\{HOSTLABEL\}/g, ucfirst(config.hostname)+((config.port != 80 && config.port != 443)?':'+config.port:''))
			.replace(/\{HOSTDOMAIN\}/g, config.url)
			.replace('{MOTD_HTML}', motd)
			.replace('{AVATARS}', JSON.stringify(avatars));
		this.login_or_signup = fs.readFileSync('./static/login_or_signup.html').toString().replace('{WELCOME_HTML}', welcome);
		this.login = fs.readFileSync('./static/login.html').toString().replace('{WELCOME_HTML}', welcome);
		this.app_auth = fs.readFileSync('./static/app_auth.html').toString();
	}
};

function ucfirst(str) {
	return str.slice(0,1).toUpperCase() + str.slice(1);
}