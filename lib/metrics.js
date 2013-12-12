var os = require('os');
var measured = require('measured');
module.exports = new measured.Collection();

// Gauges
module.exports.gauge('loadavg', function() {
	var avgs = os.loadavg();
	return avgs[0]; // 1min average
});
module.exports.gauge('memused_mb', function() {
	return process.memoryUsage().rss / 1000000;
});
module.exports.gauge('memfree_mb', function() {
	return os.freemem() / 1000000;
});

// Histograms
var loadavg_hist = module.exports.histogram('loadavg_hist');
var memused_hist = module.exports.histogram('memused_hist');
var memfree_hist = module.exports.histogram('memfree_hist');
function capture() {
	var avgs = os.loadavg();
	loadavg_hist.update(avgs[0]);
	memused_hist.update(process.memoryUsage().rss / 1000000);
	memfree_hist.update(os.freemem() / 1000000);
}
setInterval(capture, 15*1000);
capture();