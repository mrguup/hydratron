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
        callback(err, res)
    })
};

var asyncQuery = util.promisify(query);

// internal function for use in 
var getUserEntry = function ( userID, callback ) {
    let user = { id: '0' }
    db.query("SELECT ID,USERNAME FROM users WHERE users.USERID='"+userID+"'", function (e,r,f) {
        if (e) callback(e,null);

        if (r.length > 0) {
            user.name = r[0].USERNAME;
            user.id = r[0].ID;
        }
        callback(null, user);
    })
};

var getDrinkTypes = function(callback) {
    let rows = {};
    db.query("SELECT NAME,UNIT FROM drinkTypes", function (e,r,f) {
        if (e) callback(e,null);
        for (let i of r) {
            rows[i.NAME] = i.UNIT;
        }
        callback(null, rows);
    })
}

var updateUserEntry = function ( userID, userName, callback ) {
    db.query("SELECT * FROM users WHERE users.USERID='"+userID+"'", function (e,r,f) {
        if (e) callback(e,null);
        if (r.length != 0) {
            // user exists
            db.query("UPDATE `users` SET USERNAME='"+userName+"' WHERE USERID='"+userID+"'", function (e,r,f) {
                callback(e,r);
            });
        } else {
            //user does not exist
            db.query("INSERT INTO `users`(USERID,USERNAME) VALUES ('"+userID+"','"+userName+"')", function (e,r,f) {
                callback(e,r);
            });
        }
    });
};

var addDrink = function ( userID, volume, beverage, callback ) {
    let today = Date.now()
    let qs = ""
    getUserEntry( userID, function (e,r) {
        if (e) throw e;
        qs = "INSERT INTO `drinks`(USERID,VOLUME,BEVERAGE,TIMESTAMP,FK_USER_ID) VALUES ("+
            "'"+userID+"',"+
            volume+","+
            "'"+beverage+"',"+
            "'"+db.escape(today)+"',"+
            "'"+r.id+"'"+
        ")";

        logger.debug(qs);
        db.query(qs, function (e,r,f) { 
            if (e) throw e; 
            callback (null, r);
        });
    });
};

var usersDrinks = function ( userID, beverage, callback ) {
    var rows = [];
    db.query("SELECT TIMESTAMP,VOLUME,BEVERAGE FROM drinks WHERE drinks.USERID='"+userID+"' AND drinks.BEVERAGE='"+beverage+"'", function (e,r,f) { 
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
};

var todaysDrinks = function (userID, beverage, callback) {
    var today = new Date(),
        rows = [];
    usersDrinks(userID, beverage, function (e, drinkList) {
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
};

var async = {
    query: asyncQuery,
    updateUserEntry: util.promisify(updateUserEntry),
    addDrink: util.promisify(addDrink),
    usersDrinks: util.promisify(usersDrinks),
    todaysDrinks: util.promisify(todaysDrinks),
    drinkTypes: util.promisify(getDrinkTypes)
};
 
function test() {
    let result = getUserEntry('0')
    console.log(result)
    //(async () => {
    //    let result;
    //    try {
    //        result = await asyncQuery('123', console.log);
    //    } catch (err) {
    //        return console.error(err);
    //    }
    //    return console.log(result);
    //})();
};

module.exports = {
    db: db,
    query: query,
    addDrink: addDrink,
    usersDrinks: usersDrinks,
    todaysDrinks: todaysDrinks,
    updateUserEntry: updateUserEntry,
    getUserEntry: getUserEntry,

    test: test,
    async: async
};

