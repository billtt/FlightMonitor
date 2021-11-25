const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

var status = '';

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.text());

app.post('/', (req, res) => {
    status = req.body;
    res.end();
});

app.get('/', (req, res) => {
    res.locals.status = status;
    res.render('index');
});

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