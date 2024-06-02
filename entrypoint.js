// import { Contract, ethers, TransactionReceipt, Wallet } from "ethers";
// import ABI from "./abis/AgentABI.json" assert { type: "json" };
// import * as readline from "readline";
// import fs from "fs/promises"; // Use the promise-based version of fs

// import { config } from "dotenv";
// import path from "path";
// config();

// async function main() {
//   const rpcUrl = "https://devnet.galadriel.com";
//   if (!rpcUrl) throw Error("Missing RPC_URL in .env");
//   const privateKey =
//     "698ffa7b9ef6e9368120761d5e5550b29f12810209efa1c0044c413b8840cdda";
//   if (!privateKey) throw Error("Missing PRIVATE_KEY in .env");
//   const contractAddress = "0xF757B73165820b1DD00E4F0a36a6ea17aD89A15a";
//   if (!contractAddress) throw Error("Missing AGENT_CONTRACT_ADDRESS in .env");
//   const prompt = process.env.PROMPT;
//   if (!prompt) throw Error("Missing prompt in process args");

//   const provider = new ethers.JsonRpcProvider(rpcUrl);
//   const wallet = new Wallet(privateKey, provider);
//   const contract = new Contract(contractAddress, ABI, wallet);

//   // The query you want to start the agent with
//   const query = prompt;
//   const maxIterations = 1;

//   // Call the startChat function
//   const transactionResponse = await contract.runAgent(
//     query,
//     Number(maxIterations)
//   );
//   const receipt = await transactionResponse.wait();

//   // Get the agent run ID from transaction receipt logs
//   let agentRunID = getAgentRunId(receipt, contract);
//   if (!agentRunID && agentRunID !== 0) {
//     return;
//   }

//   let allMessages = [];
//   // Run the chat loop: read messages and send messages
//   var exitNextLoop = false;
//   while (true) {
//     const newMessages = await getNewMessages(
//       contract,
//       agentRunID,
//       allMessages.length
//     );
//     if (newMessages) {
//       for (let message of newMessages) {
//         if (message.role === "assistant") {
//           console.log(message.content);
//           allMessages.push(message);
//         }
//       }
//     }
//     await new Promise((resolve) => setTimeout(resolve, 2000));
//     if (await contract.isRunFinished(agentRunID)) {
//       exitNextLoop = true;
//     }

//     if (exitNextLoop) {
//       break;
//     }
//   }

//   console.log(allMessages);
//   await fs
//     .writeFile(
//       "./outputs/response.json",
//       JSON.stringify(allMessages, null, 2),
//       "utf-8"
//     )
//     .then(() => {
//       console.log("File has been saved successfully.");
//       return fs.readFile("./outputs/response.json", "utf-8");
//     })
//     .then((data) => {
//       console.log("File content:", data);
//     })
//     .catch((error) => {
//       console.error("Error reading file:", error);
//     });
//   // console.log("File has been saved successfully.");
// }

// function getAgentRunId(receipt, contract) {
//   let agentRunID;
//   for (const log of receipt.logs) {
//     try {
//       const parsedLog = contract.interface.parseLog(log);
//       if (parsedLog && parsedLog.name === "AgentRunCreated") {
//         // Second event argument
//         agentRunID = ethers.toNumber(parsedLog.args[1]);
//       }
//     } catch (error) {
//       // This log might not have been from your contract, or it might be an anonymous log
//     }
//   }
//   return agentRunID;
// }

// async function getNewMessages(contract, agentRunID, currentMessagesCount) {
//   const messages = await contract.getMessageHistoryContents(agentRunID);
//   const roles = await contract.getMessageHistoryRoles(agentRunID);

//   const newMessages = [];
//   messages.forEach((message, i) => {
//     if (i >= currentMessagesCount) {
//       newMessages.push({
//         role: roles[i],
//         content: messages[i],
//       });
//     }
//   });
//   return newMessages;
// }

// main().then();

import { Contract, Wallet, TransactionReceipt } from "ethers";
import { ethers } from "ethers";
import { performSwap } from "./swapHelper.js";
import { ABI } from "./consts.js";
import axios from "axios";

const GALARIEL_RPC_URL = "https://devnet.galadriel.com";

let chatId = null;
let messages = [];

async function getGasInfo() {
  // Gives gas used in txs for all addresses at fixed frequency
  const token =
    "eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleS1iZXJ5eC0wMDEiLCJ0eXAiOiJKV1QifQ.eyJyb2xlcyI6W10sImlzcyI6IlpvbmRheCIsImF1ZCI6WyJiZXJ5eCJdLCJleHAiOjE3MjI0NTcwNzcsImp0aSI6IkZhYmlhbiBGZXJubyxoZWxsb0BmYWJpYW5mZXJuby5jb20ifQ.J6JRiHmB7TGfuKa0I_2Gatix8MsT1UpqNbZa6UuBzzFLUPQViTk1I7bcj-FcVp5TsYMFNvpFTImzzmPkQFAMKw";

  const gasData = await axios.get(
    `https://api.zondax.ch/fil/data/v3/mainnet/stats/gas-used/global/weekly?sort_by=bucket%3Aasc`,
    {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return gasData.data;
}

const initializeChat = async (contract, input) => {
  const gasData = await getGasInfo();

  if (chatId === null) {
    console.log("Starting chat with current context...");
    const transactionResponse = await contract.startChat(`
          You are a blockchain data  analyst and your task is to analyze the following data:

            ${JSON.stringify(gasData)} ${input}

            Use the context and return only yes or no. Is it advisable to make a swap this week? 
      `);
    const receipt = await transactionResponse.wait();
    const newChatId = getChatId(receipt, contract);
    chatId = newChatId;
    console.log(`Chat started with ID: ${newChatId}`);
  }
};

function getChatId(receipt, contract) {
  for (const log of receipt.logs) {
    try {
      const parsedLog = contract.interface.parseLog(log);
      if (parsedLog && parsedLog.name === "ChatCreated") {
        return parseInt(parsedLog.args[1]);
      }
    } catch (error) {
      console.error("Could not parse log:", log);
    }
  }
  return null;
}

const fetchMessages = async (contract) => {
  console.log("Fetching messages...");
  try {
    const messagesHistory = await contract.getMessageHistoryContents(chatId);
    const roles = await contract.getMessageHistoryRoles(chatId);
    const newMessages = messagesHistory.map((message, i) => ({
      role: roles[i],
      content: message,
    }));

    console.log("Messages fetched:", newMessages);
    messages = newMessages;
    return newMessages;
  } catch (error) {
    console.error("Error fetching messages:", error);
  }
};

const addMessage = async (contract, input, setInput) => {
  console.log("Sending message...");

  if (!input.trim()) return;
  const transactionResponse = await contract.addMessage(input, chatId);
  const receipt = await transactionResponse.wait();
  console.log(`Message sent, tx hash: ${receipt.transactionHash}`);
  await fetchMessages(contract);
};

const input = process.env.INPUT;
if (!input) throw Error("Missing INPUT in process args");

async function main() {
  const privateKey =
    "eeada91a80020324fc8fb214966f5f07d15116c48bd44b426564894edd7db0b7";
  const contractAddress = "0xbb28197bccAA45A19dBedC67eFf63c86Ac92Fd2b";

  const provider = new ethers.JsonRpcProvider(GALARIEL_RPC_URL);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(contractAddress, ABI, wallet);

  let iterations = 5;

  await initializeChat(contract, input);

  // TODO: AI Agent to run the swap if the based on the gas data from getGasInfo
  while (true) {
    iterations--;
    if (iterations === 0) {
      break;
    }

    const messages = await fetchMessages(contract);
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        const message = lastMessage.content;
        if (message.toLowerCase() === "yes") {
          await performSwap();
          break;
        }
      }
    }

    // Analyze again
    await addMessage(
      contract,
      `
            Can you analyze the gas data again and provide a recommendation? - Only return yes/no
        `,
      () => {}
    );

    await new Promise((r) => setTimeout(r, 5000));
  }
}

main();
