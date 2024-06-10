const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { btoa, atob } = require('abab');
const dotenv = require('dotenv');
const { parse } = require('date-fns');
dotenv.config();

const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const STUDIO_HASH = process.env.STUDIO;
const STUDIO_INT = atob(process.env.STUDIO).split(":")[1];
const SESSION = process.env.SESSION;
const GYM = process.env.GYM;

const gyms = {
    "mcfit": "my.mcfit.com",
};

try {
    const API_HOST = gyms[GYM];
} catch (error) {
    console.error(`Invalid GYM: "${GYM}"`);
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const S = axios.create({
    withCredentials: true,
    headers: {
        'Cookie': `SESSION=${SESSION}`
    }
});

let PUBLIC_FACILITY_GROUP;
let GYM_NAME;

(async () => {
    try {
        const res = await S.get(`https://${API_HOST}/whitelabelconfigs/web`);
        PUBLIC_FACILITY_GROUP = res.data.publicFacilityGroup;
        GYM_NAME = res.data.gymName;
    } catch (error) {
        console.error(error);
        console.error("API call failed, please raise an issue on github");
        process.exit(1);
    }

    try {
        const res = await S.get(`https://${API_HOST}/sponsorship/v1/public/studios/${STUDIO_HASH}`, {
            headers: {
                "x-public-facility-group": PUBLIC_FACILITY_GROUP
            }
        });
        const NAME = res.data.name;
        console.log(`Studio: ${NAME}`);
    } catch (error) {
        console.error(error);
        console.error("Your Studio ID is wrong");
        process.exit(1);
    }
})();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

async function login() {
    if (EMAIL === "ENTER_EMAIL") {
        console.error("Set an email and password in the .env file");
        process.exit(1);
    }
    const headers = {
        'authorization': `Basic ${btoa(`${EMAIL}:${PASSWORD}`)}`,
        'origin': `https://${API_HOST}`,
        'referer': `https://${API_HOST}/login-register`,
        'user-agent': 'Mozilla/5.0',
        'x-public-facility-group': PUBLIC_FACILITY_GROUP,
        'x-gym': GYM,
    };

    try {
        const res = await S.post(`https://${API_HOST}/login`, {
            username: EMAIL,
            password: PASSWORD
        }, { headers });
        console.log("Session after login: " + res.headers['set-cookie']);
        console.log("You can save this in the .env file to speed up the login");
    } catch (error) {
        console.error(error);
    }
}


async function getUtil() {
    const headers = {
        'referer': `https://${API_HOST}/studio/${STUDIO_HASH}`,
        'user-agent': 'Mozilla/5.0',
        'x-ms-web-context': `/studio/${STUDIO_HASH}`,
        'x-nox-client-type': 'WEB',
        'x-public-facility-group': PUBLIC_FACILITY_GROUP,
        'x-gym': GYM,
    };
    try {
        let res = await S.get(`https://${API_HOST}/nox/v1/studios/${STUDIO_INT}/utilization/v2/today`, { headers });
        if (res.status !== 200) {
            await login();
            res = await S.get(`https://${API_HOST}/nox/v1/studios/${STUDIO_INT}/utilization/v2/today`, { headers });
        }
        return res.data;
    } catch (error) {
        console.error(error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'util') {
        try {
            const items = await getUtil();
            const embed = new EmbedBuilder()
                .setTitle(`${NAME} Utilization`)
                .setColor(0xFFC0CB);

            let time = "";
            let status = "";

            for (const item of items) {
                const start = parse(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const end = parse(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                time += `${start} -> ${end}\n`;
                if (item.percentage > 80) {
                    status += `🔴 ${item.percentage}%\n`;
                } else if (item.percentage > 40) {
                    status += `🟡 ${item.percentage}%\n`;
                } else {
                    status += `🟢 ${item.percentage}%\n`;
                }

                if (item["current"]) break;
            }

            embed.addFields(
                { name: "Location", value: `\`\`\`${NAME}\`\`\``, inline: false },
                { name: "Time", value: `\`\`\`${time}\`\`\`` },
                { name: "Status", value: `\`\`\`${status}\`\`\`` }
            ).setFooter({ text: `${new Date().toLocaleString()}` });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply("Error");
        }
    }

    if (commandName === 'now_util') {
        try {
            const items = await getUtil();
            const embed = new EmbedBuilder()
                .setTitle(`${NAME} Utilization`)
                .setColor(0xFFC0CB);

            let status = "";
    

            for (const item of items) {
                if (!item["current"]) continue;

                if (item.percentage > 80) {
                    status = `🔴 ${item.percentage}%`;
                } else if (item.percentage > 40) {
                    status = `🟡 ${item.percentage}%`;
                } else {
                    status = `🟢 ${item.percentage}%`;
                }
                break;
            }

            embed.addFields(
                { name: "Location", value: `\`\`\`${NAME}\`\`\``, inline: false },
                { name: "Status", value: `\`\`\`${status}\`\`\`` }
            ).setFooter({ text: `${new Date().toLocaleString()}` });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply("Error");
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
