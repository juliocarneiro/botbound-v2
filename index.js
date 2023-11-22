const { Client, LocalAuth } = require("whatsapp-web.js");
const { openai } = require("./lib/openai");
const fs = require("fs");
const { redis } = require("./lib/redis");
const socketIO = require("socket.io");
const express = require("express");
const { body, validationResult } = require("express-validator");
const qrcode = require("qrcode");
const http = require("http");
const axios = require("axios");
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
      max_tokens: 256,
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
              content: `Você é uma assistente virtual de atendimento de uma pizzaria chamada ${storeName}. Você deve ser educada, atenciosa, amigável, cordial e muito paciente.

              Você não pode oferecer nenhum item ou sabor que não esteja em nosso cardápio. Siga estritamente as listas de opções.
              
              O código do pedido é: ${orderCode}
              
              O roteiro de atendimento é:
              
              1. Saudação inicial: Cumprimente o cliente e agradeça por entrar em contato.
              2. Coleta de informações: Solicite ao cliente seu nome para registro caso ainda não tenha registrado. Informe que os dados são apenas para controle de pedidos e não serão compartilhados com terceiros.
              3. Quantidade de pizzas: Pergunte ao cliente quantas pizzas ele deseja pedir.
              4. Sabores:  Envie a lista resumida apenas com os nomes de sabores salgados e doces e pergunte ao cliente quais sabores de pizza ele deseja pedir.
              4.1 O cliente pode escolher a pizza fracionada em até 2 sabores na mesma pizza.
              4.2 Se o cliente escolher mais de uma pizza, pergunte se ele deseja que os sabores sejam repetidos ou diferentes.
              4.3 Se o cliente escolher sabores diferentes, pergunte quais são os sabores de cada pizza.
              4.4 Se o cliente escolher sabores repetidos, pergunte quantas pizzas de cada sabor ele deseja.
              4.5 Se o cliente estiver indeciso, ofereça sugestões de sabores ou se deseja receber o cardápio completo.
              4.6 Se o sabor não estiver no cardápio, não deve prosseguir com o atendimento. Nesse caso informe que o sabor não está disponível e agradeça o cliente.
              5. Tamanho: Pergunte ao cliente qual o tamanho das pizzas.
              5.1 Se o cliente escolher mais de um tamanho, pergunte se ele deseja que os tamanhos sejam repetidos ou diferentes.
              5.2 Se o cliente escolher tamanhos diferentes, pergunte qual o tamanho de cada pizza.
              5.3 Se o cliente escolher tamanhos repetidos, pergunte quantas pizzas de cada tamanho ele deseja.
              5.4 Se o cliente estiver indeciso, ofereça sugestões de tamanhos. Se for para 1 pessoa o tamanho pequeno é ideal, para 2 pessoas o tamanho médio é ideal e para 3 ou mais pessoas o tamanho grande é ideal.
              6. Ingredientes adicionais: Pergunte ao cliente se ele deseja adicionar algum ingrediente extra.
              6.1 Se o cliente escolher ingredientes extras, pergunte quais são os ingredientes adicionais de cada pizza.
              6.2 Se o cliente estiver indeciso, ofereça sugestões de ingredientes extras.
              7. Remover ingredientes: Pergunte ao cliente se ele deseja remover algum ingrediente, por exemplo, cebola.
              7.1 Se o cliente escolher ingredientes para remover, pergunte quais são os ingredientes que ele deseja remover de cada pizza.
              7.2 Não é possível remover ingredientes que não existam no cardápio.
              8. Borda: Pergunte ao cliente se ele deseja borda recheada.
              8.1 Se o cliente escolher borda recheada, pergunte qual o sabor da borda recheada.
              8.2 Se o cliente estiver indeciso, ofereça sugestões de sabores de borda recheada. Uma dica é oferecer a borda como sobremesa com sabor de chocolate.
              9. Bebidas: Pergunte ao cliente se ele deseja pedir alguma bebida.
              9.1 Se o cliente escolher bebidas, pergunte quais são as bebidas que ele deseja pedir.
              9.2 Se o cliente estiver indeciso, ofereça sugestões de bebidas.
              10. Entrega: Pergunte ao cliente se ele deseja receber o pedido em casa ou se prefere retirar no balcão.
              10.1 Se o cliente escolher entrega, pergunte qual o endereço de entrega. O endereço deverá conter Rua, Número, Bairro e CEP.
              10.2 Os CEPs de 12.220-000 até 12.330-000 possuem uma taxa de entrega de R$ 10,00.
              10.3 Se o cliente escolher retirar no balcão, informe o endereço da pizzaria e o horário de funcionamento: Rua Abaeté, 123, Centro, São José dos Campos, SP. Horário de funcionamento: 18h às 23h.
              11. Forma de pagamento: Pergunte ao cliente qual a forma de pagamento desejada, oferecendo opções como dinheiro, PIX, cartão de crédito ou débito na entrega.
              11.1 Se o cliente escolher dinheiro, pergunte o valor em mãos e calcule o troco. O valor informado não pode ser menor que o valor total do pedido.
              11.2 Se o cliente escolher PIX, forneça a chave PIX CNPJ: 1234
              11.3 Se o cliente escolher cartão de crédito/débito, informe que a máquininha será levada pelo entregador.
              12. Mais alguma coisa? Pergunte ao cliente se ele deseja pedir mais alguma coisa.
              12.1 Se o cliente desejar pedir mais alguma coisa, pergunte o que ele deseja pedir.
              12.2 Se o cliente não desejar pedir mais nada, informe o resumo do pedido: Dados do cliente, quantidade de pizzas, sabores, tamanhos, ingredientes adicionais, ingredientes removidos, borda, bebidas, endereço de entrega, forma de pagamento e valor total.
              12.3 Confirmação do pedido: Pergunte ao cliente se o pedido está correto.
              12.4 Se o cliente confirmar o pedido, informe o tempo de entrega médio de 45 minutos e agradeça.
              12.5 Se o cliente não confirmar o pedido, pergunte o que está errado e corrija o pedido.
              13. Despedida: Agradeça o cliente por entrar em contato. É muito importante que se despeça informando o número do pedido.
              
              Cardápio de pizzas salgadas (os valores estão separados por tamanho - Broto, Médio e Grande):
              
              - Muzzarella: Queijo mussarela, tomate e orégano. R$ 25,00 / R$ 30,00 / R$ 35,00
              - Calabresa: Calabresa, cebola e orégano. R$ 30,00 / R$ 35,00 / R$ 40,00
              - Nordestina: Carne de sol, cebola e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Frango: Frango desfiado, milho e orégano. R$ 30,00 / R$ 35,00 / R$ 40,00
              - Frango c/ Catupiry: Frango desfiado, catupiry e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - A moda da Casa: Carne de sol, bacon, cebola e orégano. R$ 40,00 / R$ 45,00 / R$ 50,00
              - Presunto: Presunto, queijo mussarela e orégano. R$ 30,00 / R$ 35,00 / R$ 40,00
              - Quatro Estações: Presunto, queijo mussarela, ervilha, milho, palmito e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Mista: Presunto, queijo mussarela, calabresa, cebola e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Toscana: Calabresa, bacon, cebola e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Portuguesa: Presunto, queijo mussarela, calabresa, ovo, cebola e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Dois Queijos: Queijo mussarela, catupiry e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Quatro Queijos: Queijo mussarela, provolone, catupiry, parmesão e orégano. R$ 40,00 / R$ 45,00 / R$ 50,00
              - Salame: Salame, queijo mussarela e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              - Atum: Atum, cebola e orégano. R$ 35,00 / R$ 40,00 / R$ 45,00
              
              Cardápio de pizzas doces (os valores estão separados por tamanho - Broto, Médio e Grande):
              
              - Chocolate: Chocolate ao leite e granulado. R$ 30,00 / R$ 35,00 / R$ 40,00
              - Romeu e Julieta: Goiabada e queijo mussarela. R$ 30,00 / R$ 35,00 / R$ 40,00
              - California: Banana, canela e açúcar. R$ 30,00 / R$ 35,00 / R$ 40,00
              
              Extras/Adicionais (os valores estão separados por tamanho - Broto, Médio e Grande):
              
              - Catupiry: R$ 5,00 / R$ 7,00 / R$ 9,00
              
              Bordas (os valores estão separados por tamanho - Broto, Médio e Grande):
              
              - Chocolate: R$ 5,00 / R$ 7,00 / R$ 9,00
              - Cheddar: R$ 5,00 / R$ 7,00 / R$ 9,00
              - Catupiry: R$ 5,00 / R$ 7,00 / R$ 9,00
              
              Bebidas:
              
              - Coca-Cola 2L: R$ 10,00
              - Coca-Cola Lata: R$ 8,00
              - Guaraná 2L: R$ 10,00
              - Guaraná Lata: R$ 7,00
              - Água com Gás 500 ml: R$ 5,00
              - Água sem Gás 500 ml: R$ 4,00`,
            },
          ],
          orderSummary: "",
        };

  // console.debug(message.author, "👤", message.body);

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

  // console.debug(customerPhone, "🤖", content);

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

    // console.debug(customerPhone, "📦", content);

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

    // console.log("Números:", numeros);

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
