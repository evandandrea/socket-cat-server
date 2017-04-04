
// TODO: refactor as models/modules
// TODO: convert string appends to es6 string interpolation
process.title = "socket-cat";

const webSocketsServerPort = 1337;
const webSocketServer = require("websocket").server;
const http = require("http");
const clients = [];
const colors = ["purple", "royalblue", "deeppink", "plum", "crimson"];
const server = http.createServer();
let chats = [];

// db stuff
const databaseUrl = "socketcat"; // "username:password@example.com/mydb"
const collections = ["users", "chats"];
const mongo = require("mongojs");
const db = mongo(databaseUrl, collections);

server.listen(webSocketsServerPort, () => {
    console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

const wss = new webSocketServer({
    httpServer: server
});

// load existing chats from the database
db.chats.find({}, (err, data) => {
    data.forEach((chat) => {
        chats.push(chat);
    });
});

// when a new client connects
wss.on("request", (request) => {
    // TODO: check the origin here and reject/accept the connection
    let connection = request.accept(null, request.origin);
    let index = clients.push(connection) - 1;
    let userName = null;
    let userColor = null;
    let chat = [];

    console.log((new Date()) + " Connection accepted.");

    // send back the chat history for this new connection
    if (chats.length > 0) {
        connection.sendUTF(JSON.stringify({ type: "chat", data: chats }));
    }

    // when a message is sent from a client
    connection.on("message", (message) => {
        if (!message.utf8Data) {
            return;
        }

        const request = JSON.parse(message.utf8Data);
        let response = {};

        switch (request.type) {
            case "newUser":
                userName = request.data;
                userColor = colors.shift();

                const user = {userName, color: userColor};
                db.users.save(user);

                response.type = "newUser";
                response.data = user;

                connection.sendUTF(JSON.stringify(response));
                break;
            case "command":
                const params = request.data.split(" ");

                switch(params[0]) {
                    case "clear":
                        db.chats.drop();
                        chats = [];
                        response = { type: "userMessage", data: `cleared by user ${userName}` };
                        connection.sendUTF(JSON.stringify(response));
                        break;
                    case "sh":
                        let exec = require('child_process').exec;

                        exec(params[1], (err, stdout, stderr) => {
                            console.log(stdout);
                            response = { type: "userMessage", data: stdout, level: "console" };

                            clients.forEach((client) => {
                                client.sendUTF(JSON.stringify(response));
                            });
                        });

                        break;
                    default:
                        response = { type: "userMessage", data: "invalid command", level: "error" };
                        connection.sendUTF(JSON.stringify(response));
                        break;
                }

                break;
            case "chat":
                chat = {
                    time: new Date().getTime(),
                    text: request.data,
                    author: userName,
                    color: userColor
                };

                chats.push(chat);

                response = { type: "chat", data: chats };

                db.chats.save(chat);

                // send json to all connected clients
                clients.forEach((client) => {
                    client.sendUTF(JSON.stringify(response));
                });
                break;
        }
    });

    // when a connection is closed
    connection.on("close", function(connection) {
        if (userName !== null && userColor !== null) {
            console.log(new Date() + " Peer " + connection.remoteAddress + " disconnected.");
            clients.splice(index, 1);
            colors.push(userColor);
        }
    });
});
