const csv = require('fast-csv');
const fs = require('fs');
const oneDay = 86400000;                //ms in 24 hrs
const oneUnit = oneDay;
var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var conf = require('./config.json');

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

//data dir setup
datadir = './data'
if (!fs.existsSync(datadir)) {
    logger.info(`Spawning ${datadir} because I couldn't find it`)
    fs.mkdirSync(datadir)
}

logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
})

function drink(userID, args, callback) {
    if (args.length !== 1) {
        return { success: false, help: true, message: "Invalid command" } ;
    }
    if (isNaN(args[0])) {
        return { success: false, help: false, message: "It's gotta be a number in ounces, dingus." };
    }

    var fname = `${datadir}/${userID}.csv`;
    var ws = fs.createWriteStream(fname, {flags: 'a'});
    csv
        .write(
            [
                [Date.now(),args[0],'testing'], []
            ],
            {headers:false}
        )
        .pipe(ws);

    var dayTotal = 0;
    fs.createReadStream(fname).pipe(csv())
        .on('data', function (data) {
            howLongAgo = parseInt(Date.now() - parseInt(data[0]))
            logger.info(`Drank ${data[1]}oz ${howLongAgo}ms ago`)
            if (howLongAgo < oneUnit) {
                dayTotal = dayTotal + parseInt(data[1]);
            }
        })
        .on('end', function() {
            callback({success: true, help: false, message: `Delicious! You have consumed ${dayTotal} ounces in the last 24 hours.`})
        })
}

bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);

	logger.info(`Caught "${user} in ${channelID} : ${message}"`)
	if (conf.channels.includes(channelID)) { 
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
            //    to: channelID,
            //    message: "Dad says I can't talk in here."
            //})
        }
     }
});

