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

const mode = 'csv'

// Configure logger settings
let logger = winston.createLogger({
    transports: [
        //new (winston.transports.File)({ filename: 'console.log' }),
        new (winston.transports.Console)({
            level: 'info', 
            colorize: true
        })
    ]
});

//data dir setup
datadir = './data'
if (!fs.existsSync(datadir)) {
    logger.debug(`Spawning ${datadir} because I couldn't find it`)
    fs.mkdirSync(datadir)
}

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info(`Logged in as: ${bot.username} (${bot.id})`);
})

function drink(userID, args, callback) {
    if (args.length !== 1) {
        callback({ 
            success: false, 
            help: true, 
            message: "Invalid command" 
        });
        return
    }
    if (isNaN(args[0])) {
        callback({ 
            success: false, 
            help: false, 
            message: "It's gotta be a number in ounces, dingus." 
        });
        return
    }

    var fname = `${datadir}/${userID}.csv`;
    if (args[0] != 0) {
        if (mode === 'csv') {
            var ws = fs.createWriteStream(fname, {flags: 'a'});
            // csv entry
            csv
                .write(
                    [
                        [Date.now(),args[0],Date()], 
                        []
                    ],
                    {headers:false}
                )
                .pipe(ws);
        } else if (mode === 'sql') {
            // sql entry
            sql.addDrink(userID, args[0], 'water')
        }
    }

    var dayTotal = 0;
    if (mode === 'csv') {
        fs.createReadStream(fname).pipe(csv())
            .on('data', function (data) {
                howLongAgo = parseInt(Date.now() - parseInt(data[0]))
                //logger.info(`Drank ${data[1]}oz ${howLongAgo}ms ago`)
                if (howLongAgo < oneUnit) {
                    dayTotal = dayTotal + parseInt(data[1]);
                }
            })
            .on('end', function() {
                if (args[0] == 0) { 
                    callback({
                        success: true, 
                        help: false, 
                        message: "Why did you tell me you didn't drink water? \n" +
                                 "I'm a hydration bot, not your failure diary. \n" +
                                 `You have consumed ${dayTotal} ounces in the last 24 hours.`
                    });
                    return;
                } else {
                    callback({
                        success: true, 
                        help: false, 
                        message: `Delicious! You have consumed ${dayTotal} ounces in the last 24 hours.`
                    });
                    return;
                }
            })
    } else if (mode === 'sql') {
        sql.todaysDrinks(userID, function (e, r) {
            if (e) {
                callback({
                    success: false,
                    help: false,
                    message: e
                });
                return;
            } else {
                _.forEach(r, function (d, i) {
                    dayTotal += d.volume;
                })

                if (args[0] == 0) { 
                    callback({
                        success: true, 
                        help: false, 
                        message: "Why did you tell me you didn't drink water? \n" +
                                 "I'm a hydration bot, not your failure diary. \n" +
                                 `You have consumed ${dayTotal} ounces in the last 24 hours.`
                    });
                    return;
                } else {
                    callback({
                        success: true, 
                        help: false, 
                        message: `Delicious! You have consumed ${dayTotal} ounces today.`
                    });
                    return;
                }
            }
        });
    }
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
	if (!evt.d.guild_id) { 
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
                case 'whisper':
                    bot.sendMessage({
                        to: userID,
                        message: `I heard "${args}"`
                    })
                break;
            }
        //channel message
	} else if (conf.channels.includes(channelID)) {
            switch(cmd) {
                case 'parrot':
                    bot.sendMessage({
                        to: channelID,
                        message: `I heard "${args}"`
                    });
                break;
                case 'drink':
                    drink(userID, args, function(r) {
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

