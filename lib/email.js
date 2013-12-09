var nodemailer = require("nodemailer");

// create reusable transport method (opens pool of SMTP connections)
module.exports = nodemailer.createTransport('SMTP', { host: 'localhost' });

