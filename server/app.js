const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

const config = require('config');
const axios = require('axios').default;
const xml2js = require('xml2js');

var status = {};

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/', (req, res) => {
    status = req.body;
    res.end();
});

app.get('/', (req, res) => {
    res.locals.ak = config.get('ak');
    res.render('index');
});

app.get('/status', (req, res) => {
    res.json(status);
});

app.get('/plan', (req, res) => {
    let sbId = config.get('simbriefId');
    axios.get(`https://www.simbrief.com/api/xml.fetcher.php?userid=${sbId}`)
        .then((resp) => {
            if (resp.status === 200 && resp.data.startsWith('<?xml')) {
                xml2js.parseString(resp.data, (err, json) => {
                    if (err) {
                        return res.json({code: 3, err: err.toString()});
                    }
                    return res.json(getFlightPlan(json));
                });
            } else {
                return res.json({code: 2});
            }
        })
        .catch((err) => {
            res.json({code: 1, err: err.toString()});
        });
});

function getFlightPlan(raw) {
    function getNumber(obj, name) {
        return parseFloat(obj[name][0]);
    }

    raw = raw.OFP;
    const origin = raw.origin[0];
    const destination = raw.destination[0];
    let plan = {
        code: 0,
        airline: raw.general[0].icao_airline[0],
        flightNumber: raw.general[0].flight_number[0],
        origin: {
            icaoCode: origin.icao_code[0],
            iataCode: origin.iata_code[0],
            elevation: getNumber(origin, 'elevation'),
            lat: getNumber(origin, 'pos_lat'),
            long: getNumber(origin, 'pos_long'),
            name: origin.name[0],
            runway: origin.plan_rwy[0]
        },
        destination: {
            icaoCode: destination.icao_code[0],
            iataCode: destination.iata_code[0],
            elevation: getNumber(destination, 'elevation'),
            lat: getNumber(destination, 'pos_lat'),
            long: getNumber(destination, 'pos_long'),
            name: destination.name[0],
            runway: destination.plan_rwy[0]
        },
        fixes: []
    };
    let fixes = plan.fixes;
    fixes.push({
        lat: plan.origin.lat,
        long: plan.origin.long,
        id: plan.origin.icaoCode,
        name: plan.origin.name
    });
    for (const fix of raw.navlog[0].fix) {
        if (fix.type[0] !== 'wpt' && fix.type[0] !== 'vor') {
            continue;
        }
        fixes.push({
            lat: getNumber(fix, 'pos_lat'),
            long: getNumber(fix, 'pos_long'),
            id: fix.ident[0],
            name: fix.name[0],
            sidStar: fix.is_sid_star[0] === '1'
        });
    }
    fixes.push({
        lat: plan.destination.lat,
        long: plan.destination.long,
        id: plan.destination.icaoCode,
        name: plan.destination.name
    });
    return plan;
}

function start() {
    // check port argument
    const argv = process.argv;
    var port = 3000;
    if (argv.length < 3 || isNaN(parseInt(argv[2]))) {
        console.log('Port number not specified, using default (3000).');
    } else {
        port = parseInt(argv[2]);
    }
    app.listen(port, () => {
        console.log(`Listening at port ${port}`);
    });
}

start();