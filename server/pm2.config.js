module.exports = {
    apps: [{
        name: "Flight Monitor",
        script: "./app.js",
        cwd: "./",
        log_file: "./logs/flight-monitor.log",
        restart_delay: 10000,
        env: {
            PORT: 3002,
	    TZ: "Asia/Shanghai"
        }
    }]
}
