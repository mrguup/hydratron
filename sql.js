//env shenanigans
process.env.TZ = "America/Chicago"

var mysql = require('mysql');
var auth = require('./auth.json');
var conf = require('./config.json');
var winston = require('winston')
var util = require('util')
var _ = require('lodash/core');

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
        callback(null, rows, fields);
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
        callback (null, r) 
    });
    delete today;
    return r;
};

var usersDrinks = function ( userID, callback ) {
    var rows = [];
    db.query("SELECT TIMESTAMP,VOLUME,BEVERAGE FROM drinks WHERE drinks.USERID='"+userID+"'", function (e,r,f) { 
        if (e) callback(e, null);
        logger.debug(`Collecting data for ${userID}`)
        for (let i of r) {
            var _r = {
                timestamp   : i.TIMESTAMP,
                volume      : i.VOLUME,
                beverage    : i.BEVERAGE
            }
            logger.debug(_r)
            rows.push(_r);
            delete _r;
        }
        callback(null, rows) 
    });
    return rows;
}

var todaysDrinks = function (userID, callback) {
    var today = new Date(),
        rows = [];
    usersDrinks(userID, function (e, drinkList) {
        if (e) callback(e, null);
        logger.debug(`Parsing ${JSON.stringify(drinkList)}`)
        _.forEach(drinkList, function(drink, i) {

            drink.date = new Date( Number(drink.timestamp) );
            logger.debug(` > Drink : ${JSON.stringify(drink)}`);
            
            if (drink.date.getDate() == today.getDate() && 
                drink.date.getMonth() == today.getMonth() &&
                drink.date.getYear() == today.getYear()) {
                // we have a date match, push it
                rows.push(drink);
            }
        });
        callback(null, rows);
    });
    return rows;
}

var async = {
    query: util.promisify(query),
    addDrink: util.promisify(addDrink),
    usersDrinks: util.promisify(usersDrinks),
    todaysDrinks: util.promisify(todaysDrinks)
}
 
async function test() {
    (async () => {
        let result;
        try {
            result = await async.addDrink('123', 1, 'water')
        } catch (err) {
            return console.error(err);
        }
        return console.log(result);
    })();
}

module.exports = {
    db: db,
    query: query,
    addDrink: addDrink,
    usersDrinks: usersDrinks,
    todaysDrinks: todaysDrinks,
    test: test,
    async: async
}

