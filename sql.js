//env shenanigans
process.env.TZ = "America/Chicago"

var mysql = require('mysql');
var auth = require('./auth.json');
var conf = require('./config.json');
var winston = require('winston')

let logger = winston.createLogger({
    transports: [
        new (winston.transports.Console)({
            level: 'info', 
            colorize: true
        })
    ]
});

var sqloptions = auth.sql;
sqloptions.connectionLimit = 10;

var db = mysql.createPool(sqloptions)
    .on('connection', function (conn) {
        logger.debug(`Connection ${conn.threadId} established`)
    })
    .on('release', function (conn) {
        logger.debug(`Connection ${conn.threadId} released`)
        return;
    });;

var query = function ( querystring, callback ) {
    var rows = []
    var fields = {}
    db.query(querystring, function (err, res, fields){
        if (err) throw err;
        rows = res;
        fields = fields;
    }).on('end', function() {
        callback(rows, fields);
    })
};

var newDay = function( userID, callback ) {

};

var addDrink = function ( userID, volume, beverage, callback ) {
    var today = Date.now()
    var qs = "INSERT INTO `drinks`(USERID,VOLUME,BEVERAGE,TIMESTAMP) VALUES ("+
        "'"+userID+"',"+
        volume+","+
        "'"+beverage+"',"+
        "'"+db.escape(today)+"'"+
    ")";
    logger.debug(qs)
    db.query(qs, function (e,r,f) { 
        if (e) throw e; 
        if (callback) { return callback (r) }
        else { return r }
    });
    delete today
};

var usersDrinks = function ( userID, callback ) {
    var rows = []
    var today = new Date();
    db.query("SELECT TIMESTAMP,VOLUME,BEVERAGE FROM drinks WHERE drinks.USERID='"+userID+"'", function (e,r,f) { 
        if (e) throw e;
        for (let i of r) {
            var _r = {
                timestamp   : i.TIMESTAMP,
                volume      : i.VOLUME,
                beverage    : i.BEVERAGE
            }
            rows.push(_r)
            delete _r
        }
        if (callback) callback(rows)
        else return rows
    });
}
 
function test() {
    console.log(addDrink('1234567890',20,'water'))
}

module.exports = {
    db: db,
    query: query,
    addDrink: addDrink,
    usersDrinks: usersDrinks,
    test: test
}

