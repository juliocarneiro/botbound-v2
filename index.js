const { Client, LocalAuth } = require("whatsapp-web.js");
const { openai } = require("./lib/openai");
const fs = require("fs");
const { redis } = require("./lib/redis");
const socketIO = require("socket.io");
const express = require("express");
const { body, validationResult } = require("express-validator");
const qrcode = require("qrcode");
const http = require("http");
// const axios = require("axios");
const { phoneNumberFormatter } = require("./helpers/formatter");
const cors = require("cors");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const token = "Bearer *!/0?;&okyE[)G4z;Zi},~VkS#~JO0QR";
const username = "adm";
const password = "adm";

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

function checkToken(request) {
  if (!request.headers["authorization"]) {
    return false;
  } else if (request.headers["authorization"] != token) {
    return false;
  } else {
    return true;
  }
}

const myId = "SingleDeviceX";

const authStrategy = new LocalAuth({
  clientId: myId,
});

const worker = `${authStrategy.dataPath}/session-${myId}/Default/Service Worker`;
if (fs.existsSync(worker)) {
  fs.rmSync(worker, { recursive: true });
}

//Client

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10,
});

//Completion

async function completion(messages, forMe) {
  if (forMe) {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 0,
      max_tokens: 512,
      messages,
    });

    return completion.data.choices[0].message?.content;
  }
  return null;
}

// GPT/Message
client.on("message", async (message) => {
  const storeName = process.env.STORE_NAME || "Store";
  const chat = await message.getChat();

  if (!message.body || chat.isGroup) return;

  const customerPhone = `+${message.from.replace("@c.us", "")}`;
  const customerName = message.author;
  const orderCode = `#sk-${("00000" + Math.random()).slice(-5)}`;
  const customerKey = `customer:${customerPhone}:chat`;
  const lastChat = JSON.parse((await redis.get(customerKey)) || "{}");

  // Envia uma requisição get para o wordpress
  // const data = await axios({
  //   method: "get",
  //   url: "https://iabuild.com.br/wp-json/jet-cct/assistente?_ID=1",
  // });

  // console.log("data", data.data[0].prompt);

  const customerChat =
    lastChat?.status === "open"
      ? lastChat
      : {
          status: "open",
          orderCode,
          chatAt: new Date().toISOString(),
          customer: {
            name: customerName,
            phone: customerPhone,
          },
          messages: [
            {
              role: "system",
              content: `Você é uma assistente virtual de atendimento de uma loja que vende lingeries chamada La Casa da Lingerie. Você deve ser educada, atenciosa, amigável, cordial e muito paciente.

              Você não pode oferecer nenhum item que não esteja em nossa lista. Siga estritamente as listas de opções.
              
              O roteiro de atendimento é:
              
              1. Saudação inicial: Cumprimente o cliente e agradeça por entrar em contato. Caso o cliente não seja identificado, pergunte o nome do cliente para registro, senão, saude o cliente pelo nome.
              2. Coleta de informações: Solicite ao cliente seu nome e número de telefone com o DDD para registro caso ainda não tenha registrado.
              2.1 Caso o cliente seja informado, basta confirmar os dados e agradecer.
              2.2 Caso o cliente não forneça o número de telefone, registre o telefone como 1299999-9999.
              3. Escolha do tipo de produto a ser comprado: Pergunte ao cliente qual o tipo de produto ele deseja informações.
              3.1 Se o cliente não souber a lista de tipo de produto, envie uma lista com somente os tipos de produto.
              4. Cores: Baseado no tipo de produto escolhido envie a lista resumida apenas com os nomes dos itens e cores disponíveis  e pergunte ao cliente sobre qual item deseja informação e qual a informação que deseja.
              4.1 Caso o cliente queira saber sobre quantidades disponíveis, o redirecione ao site www.globo.com.
              4.2 Caso o cliente pergunte sobre medidas ou composição (material), apresente as informações correspondes disponíveis na lista produtos.
              5. Tamanho: Baseado no item escolhido envie a lista resumida apenas com os nomes dos itens e tamanhos disponíveis  e pergunte ao cliente sobre qual item deseja informação e qual a informação que deseja.
              5.1 Caso o cliente queira saber sobre quantidades disponíveis, o redirecione ao site www.globo.com.
              5.2 Caso o cliente pergunte sobre medidas ou composição (material), apresente as informações correspondes disponíveis na lista produtos.
              6. Pergunte ao cliente se ele precisa de informações sobre mais algum produto.
              6.1 Caso o cliente não queira mais atendimento, apresente uma mensagem de despedida cordial.
              6.2 Caso o cliente queira mais informações, retome o processo.
              
              Lista de itens disponíveis:
              tipo        | nome              | material  | preço     | cores             | tamanhos      | medidas                               |
              cueca       | cueca calvo klein | elastano  | R$ 5,99   | branco, preto     | P, M          | P - 10 cm, M - 20 cm, G - 30 cm, GG - 40 cm   |
              cueca       | cueca lupe        | algodão   | R$ 6,99   | branco, verde     | M, GG         | P - 10 cm, M - 20 cm, G - 30 cm, GG - 40 cm   |
              calcinha    | calcinha mariso   | algodão   | R$ 7,99   | preto, vermelha   | P, M, G, GG   | P - 10 cm, M - 20 cm, G - 30 cm, GG - 40 cm   |
              calcinha    | calcinha invisible| algodão   | R$ 8,99   | vermelha, rosa    | P, M, GG      | P - 10 cm, M - 20 cm, G - 30 cm, GG - 40 cm   |
              meia        | meia na canela    | algodão   | R$ 9,99   | branca            | 38, 39, 40    | 38 - 11 cm, 39 - 12 cm, 40 - 13  cm           |
              `,
            },
          ],
          orderSummary: "",
        };

  console.debug(message.author, "👤", message.body);

  chat.sendStateTyping();

  customerChat.messages.push({
    role: "user",
    content: message.body,
  });

  const content =
    (await completion(customerChat.messages, true)) ||
    process.env.CUSTOMER_NEGATIVE_MESSAGE ||
    "Não entendi";

  customerChat.messages.push({
    role: "assistant",
    content,
  });

  console.debug(customerPhone, "🤖", content);

  setTimeout(async () => {
    await client.sendMessage(message.from, content);
  }, 8000);

  if (customerChat.status === "open" && content.match(customerChat.orderCode)) {
    customerChat.status = "closed";

    customerChat.messages.push({
      role: "user",
      content: process.env.CUSTOMER_CHAT_MESSAGE,
    });

    const content =
      (await completion(customerChat.messages, true)) ||
      process.env.CUSTOMER_NEGATIVE_MESSAGE;

    console.debug(customerPhone, "📦", content);

    customerChat.orderSummary = content;
    redis.set(customerKey, JSON.stringify({}));
    return;
  }
  redis.set(customerKey, JSON.stringify(customerChat));
});

client.initialize();

// Socket IO
io.on("connection", function (socket) {
  socket.emit("message", "Conectando...");

  client.on("qr", async (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", "QR Code recebido, scaneie para conectar!");
    });
  });

  client.on("authenticated", () => {
    socket.emit("authenticated", "Whatsapp está autenticado!");
    socket.emit("message", "Whatsapp está autenticado!");
    console.log("AUTHENTICATED");
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", "Autenticação falhou, restartando...");
  });

  client.on("ready", async () => {
    socket.emit("ready", "Whatsapp está pronto!");
    socket.emit("message", "Whatsapp está pronto!");
  });

  client.on("disconnected", (reason) => {
    socket.emit("message", "Whatsapp foi desconectado!");
    client.destroy();
    client.initialize();
  });
});

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

// Login
app.get("/", (req, res) => {
  res.sendFile("./html/login.html", {
    root: __dirname,
  });
});

// Qrcode
app.post("/app", (req, res) => {
  if (req.body.username == username && req.body.password == password) {
    res.sendFile("./html/index.html", {
      root: __dirname,
    });
  } else {
    let string = "Login falhou!";
    res.redirect("/?message=" + string);
  }
});

// Send message
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    var status = checkToken(req);
    if (status == false) {
      return res.status(422).json({
        status: false,
        message: "Seu token está errado ou vazio.",
      });
    }
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "O número nao está registrado.",
      });
    }

    client
      .sendMessage(number, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: "Mensagem enviada com sucesso!",
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

//Status
app.get("/status", async (req, res) => {
  res.sendFile("./html/status.html", {
    root: __dirname,
  });
});

// Adiciona função de multiplos destinatarios

app.use(
  cors({
    origin: ["http://iabuildtest.local"],
  })
);

app.post(
  "/enviar-mensagem-para-multiplos",
  upload.single("csvFile"), // Adiciona o middleware multer para processar o upload do arquivo
  [body("mensagem").notEmpty()],
  async (req, res) => {
    const status = checkToken(req);
    if (!status) {
      return res.status(422).json({
        status: false,
        message: "Seu token está incorreto ou vazio.",
      });
    }

    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }

    // Obtemos os números do arquivo, se estiver presente, ou do corpo da requisição
    const numeros = req.file
      ? req.file.buffer
          .toString()
          .split("\n")
          .map((numero) => phoneNumberFormatter(numero.trim()))
      : req.body.numeros.map(phoneNumberFormatter);

    console.log("Números:", numeros);

    const mensagem = req.body.mensagem;

    // Itere pela lista de números e envie a mesma mensagem para cada um
    for (const numero of numeros) {
      const isRegistrado = await checkRegisteredNumber(numero);

      if (isRegistrado) {
        try {
          await client.sendMessage(numero, mensagem);
        } catch (error) {
          console.error(`Erro no envio da mensagem para ${numero}:`, error);
        }
      }
    }

    res.status(200).json({
      status: true,
      response: "Mensagens enviadas para múltiplos números com sucesso!",
    });
  }
);

server.listen(port, function () {
  console.log("App running on *: " + port);
});
