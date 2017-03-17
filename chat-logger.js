'use strict';

const redis = require('./redis.js');

const MONTH = 30 * 24 * 60 * 60 * 1000;

let leftpad = val => (val < 10 ? `0${val}`: val);

class ChatLogger {
    constructor() {
        this.logs = redis.useDatabase('logs');
    }

    async getRooms() {
        let keys = await this.logs.keys('*');
        let rooms = [];

        for (let i = 0; i < keys.length; i++) {
            let roomid = keys[i].split(':')[0];
            if (!rooms.includes(roomid)) rooms.push(roomid);
        }

        return rooms;
    }

    async log(timestamp, room, userid, message) {
        timestamp = parseInt(timestamp);
        if (isNaN(timestamp)) return;

        let date = new Date(timestamp * 1000);

        let key = `${room}:${userid}:${leftpad(date.getUTCDate())}:${leftpad(date.getUTCMonth() + 1)}:${leftpad(date.getUTCHours())}:${leftpad(date.getMinutes())}:${leftpad(date.getSeconds())}`

        console.log(`Logging '${key}': ${message}`)

        if (await this.logs.exists(key)) {
            this.logs.append(key, `\t${message}`);
        } else {
            await this.logs.set(key, message);
            this.logs.pexpire(key, MONTH);
        }
    }

    async getUserLogs(room, userid) {
        let keys = await this.logs.keys(`${room}:${userid}:*`);
        let output = {};

        for (let i = 0; i < keys.length; i++) {
            let [,, day, month, hour, minute] = keys[i].split(':');
            output[`${day}/${month} ${hour}:${minute}`] = await this.logs.get(keys[i]);
        }

        return output;
    }

    async getLineCount(room, userid) {
        let keys = await this.logs.keys(`${room}:${userid}:*`);
        let output = {};

        for (let i = 0; i < keys.length; i++) {
            let [,, day, month] = keys[i].split(':');
            let key = `${day}/${month}`;
            if (key in output) {
                output[key]++;
            } else {
                output[key] = 1;
            }
        }

        return output;        
    }
}

module.exports = new ChatLogger();