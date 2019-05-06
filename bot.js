const csv = require('fast-csv');
const fs = require('fs');
const oneDay = 86400000;                //ms in 24 hrs
const oneUnit = oneDay;
const git = require('simple-git')('.');
const { execSync } = require('child_process');
var Discord = require('discord.io');
var winston = require('winston');
var auth = require('./auth.json');
var conf = require('./config.json');
var sql = require('./sql.js');
var _ = require('lodash/core');

const mode = 'sql'
var beverageTypes = {}

// Configure logger settings
let logger = winston.createLogger({
    transports: [
        //new (winston.transports.File)({ filename: 'console.log' }),
        new (winston.transports.Console)({
            level: 'debug', 
            colorize: true
        })
    ]
});

//data dir setup
datadir = './data'
if (!fs.existsSync(datadir)) {
    logger.debug(`Spawning ${datadir} because I couldn't find it`);
    fs.mkdirSync(datadir);
}

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info(`Logged in as: ${bot.username} (${bot.id})`);
    (async function () {
        await sql.async.drinkTypes()
            .then(data => { 
                beverageTypes = data;
                console.log(JSON.stringify(data))
            })
            .catch(err => { 
                logger.error("Could not load bevtypes. Defaulting...");
                beverageTypes = { 'water': 'oz' };
            })
    })();
})

/**
 * @param {string}      userID      discord userID issuing the command
 * @param {[string]}    args        array of args passed to drink command
 * @param {function}    callback    standard JS callback taking (error, response)
 */
function drink(userID, userName, args, callback) {
    //if (args.length !== 1) {
    //    callback({ 
    //        success: false, 
    //        help: true, 
    //        message: "Invalid command" 
    //    });
    //    return
    //}
    if (isNaN(args[0])) {
        callback(null, { 
            success: false, 
            help: false, 
            message: "It's gotta be a number, dingus." 
        });
        return
    }


    if (mode === 'sql') {
        (async function (userID, userName, args, callback) {
            let beverage = 'water';

            // upsert user to DB
            await sql.async.updateUserEntry(userID, userName)
                .then(res => logger.debug(`Updated ${userName} in DB`))
                .catch(err => callback(JSON.stringify(err), null));

            //extract beverage
            if (args[1]) {
                beverage = args[1];
                if (!beverageTypes[beverage]) {
                    callback(null, {
                        success: false,
                        help: false,
                        message: `What the hell is ${beverage}, you sick fuck?`
                    });
                    return;
                }
            }

            // write data
            if (args[0] != 0) {
                await sql.async.addDrink(userID, args[0], beverage)
                    .then(res => logger.debug(`Added entry for ${userID}`))
                    .catch(err => callback(JSON.stringify(err), null));
            }

            // read and parse data
            sql.todaysDrinks(userID, beverage, function (e, r) {
                if (e) {
                    callback(e, {
                        success: false,
                        help: false,
                        message: e
                    });
                    return;
                } else {
                    var dayTotal = 0;

                    _.forEach(r, function (d, i) {
                        logger.debug(JSON.stringify(d))
                        dayTotal += d.volume;
                    })

                    if (args[0] == 0) { 
                        callback(null, {
                            success: true, 
                            help: false, 
                            message: "Why did you tell me you didn't ingest something? \n" +
                                     "I'm a nutrition bot, not your failure diary. \n" +
                                     `You have consumed ${dayTotal} ${beverageTypes[beverage]} in the last 24 hours.`
                        });
                        return;
                    } else {
                        callback(null, {
                            success: true, 
                            help: false, 
                            message: `Delicious! You have consumed ${dayTotal} ${beverageTypes[beverage]} today.`
                        });
                        return;
                    }
                }
            });
        })(userID, userName, args, callback);
    }
}

/**
 * @param {string}      userID      discord userID issuing the command
 * @param {string}      drink       the drink to report on. if null, report all drinks by user 
 * @param {string}      date        the date to report on. if null, report current date
 * @param {function}    callback    standard JS callback taking (error, response)
 */
function drinkReport(userID, beverage, date, callback) {
    sql.specificDaysDrinks(userID, beverage, date, callback);
}

bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == conf.prefix) {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);

	logger.debug(`Caught "${user} <${userID}> in ${channelID} : ${message}"`)
        //console.log(`EVT: ${JSON.stringify(evt,null,2)}`)

        //DM
	if (!evt.d.guild_id || conf.channels.includes(channelID)) { 
            switch (cmd) {
                case 'update':
                    if (conf.admins.includes(user)) {
                        bot.sendMessage({
                            to: channelID,
                            message: "Downloading updates and restarting!"
                        });
                        logger.info("Running git pull")
                        git
                            .pull()
                            .then(function() {
                                logger.info("GOING DOWN!")
                                let stdout = execSync('/usr/local/bin/forever restart hydratron');
                            });
                    } else {
                        logger.info(`${user} is trying to get fancy with the bot`);
                        bot.sendMessage({
                            to: channelID,
                            message: "You aren't my real dad!"
                        });
                    }
                break;
                case 'report':
                    let date = null,
                        drink = null,
                        usersDrinks = {};
                    if (args[0]) { date = new Date(args[0]); }
                    else { date = new Date(); }
                    drinkReport(userID, drink, date, function (e,r) {
                        if (e) {
                            logger.error(e);
                            return;
                        }

                        //console.log(r);
                        for (let i in r) {
                            let drinkObj = r[i];
                            if (!usersDrinks[drinkObj.beverage]) { usersDrinks[drinkObj.beverage] = 0; }
                            usersDrinks[drinkObj.beverage] += drinkObj.volume;
                        }
                        //console.log(usersDrinks)
                        // build string
                        //console.log(date)
                        let msgString = `Hello ${user}, on ${date.toDateString()} you drank:`;
                        for (let drinkName in usersDrinks) {
                            msgString += `\n    ${usersDrinks[drinkName]} ${beverageTypes[drinkName]} of ${drinkName}`
                        }
                        bot.sendMessage({
                            to: channelID,
                            message: msgString
                        })
                    });
                break;
                case 'whisper':
                    bot.sendMessage({
                        to: userID,
                        message: `I heard "${args}"`
                    })
                break;
                case 'parrot':
                    bot.sendMessage({
                        to: channelID,
                        message: `I heard "${args}"`
                    });
                break;
                case 'drink':
                    drink(userID, user, args, function(e,r) {
                        if (e) { 
                            logger.error(e);
                            bot.sendMessage({
                                to: channelID,
                                message: "I shidded and farded (something went wrong. Ping the devs angrily.)"
                            })
                        }
                        else {
                            bot.sendMessage({
                                to: channelID,
                                message: r.message
                            })
                            if (r.help) {
                                bot.sendMessage({
                                    to: channelID,
                                    message: "You must specify an amount. \ni.e. '!drink 64' for 64oz of H2O"
                                })
                            }
                        }
                    })
                break;
                // Just add any case commands if you want to..
            }
        } else {
            logger.info(`user ${user} tried to use the bot wrongly`)
            //bot.sendMessage({
            //    to: userID,
            //    message: "Talk to me in designated channels, please."
            //})
        }
     }
});

