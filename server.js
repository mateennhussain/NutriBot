const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

let messages = [];
let nutritionInfoCollectionState = {
  active: false,
  height: null, // in cm
  weight: null, // in kg
  specificInstructions: null,
};

// Function to calculate BMI
function calculateBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm || heightCm === 0) return null;
    const heightM = heightCm / 100;
    return (weightKg / (heightM * heightM)).toFixed(2);
}

app.post("/completions", async (req, res) => {
  const { message } = req.body;

  if (message.toLowerCase().includes("create image:")) {
    return res.status(501).send({ error: "Image generation not supported with Gemini." });
  } else {
    try {
      // Add user message to the chat history only if it's not a follow-up for nutrition details that will be handled internally
      // This is to avoid double-adding or adding intermediate messages to Gemini's history when processing specific fields.
      // We will add the final combined prompt for nutrition plan to messages array later if applicable.

      let completion;
      let botResponseHandled = false;

      // Check if we are in the middle of collecting nutrition information
      if (nutritionInfoCollectionState.active) {
        // Try to parse the incoming message for height, weight, and instructions
        const heightMatch = message.match(/height is (\d+(\.\d+)?)\s*(cm|meter)/i);
        const weightMatch = message.match(/weight is (\d+(\.\d+)?)\s*(kg|lbs)/i);

        if (heightMatch && nutritionInfoCollectionState.height === null) {
          nutritionInfoCollectionState.height = parseFloat(heightMatch[1]);
          if (heightMatch[3].toLowerCase() === 'meter') {
            nutritionInfoCollectionState.height *= 100; // Convert to cm
          }
        }
        if (weightMatch && nutritionInfoCollectionState.weight === null) {
          nutritionInfoCollectionState.weight = parseFloat(weightMatch[1]);
          if (weightMatch[3].toLowerCase() === 'lbs') {
            nutritionInfoCollectionState.weight *= 0.453592; // Convert to kg
          }
        }

        // --- IMPROVED LOGIC for specificInstructions ---
        // If specificInstructions is not yet set, we will try to extract it from the current message.
        if (nutritionInfoCollectionState.specificInstructions === null) {
            let cleanMessage = message;

            // Remove already parsed height and weight patterns from the message
            cleanMessage = cleanMessage.replace(/height is (\d+(\.\d+)?)\s*(cm|meter)/i, '');
            cleanMessage = cleanMessage.replace(/weight is (\d+(\.\d+)?)\s*(kg|lbs)/i, '');
            cleanMessage = cleanMessage.trim(); // Trim any leading/trailing whitespace

            // Now, if the cleaned message still has content, consider it as instructions
            if (cleanMessage.length > 0 && !(heightMatch || weightMatch)) { // Only if not solely height/weight
                 // If height and weight are already gathered, then this message is likely the instructions.
                if (nutritionInfoCollectionState.height !== null && nutritionInfoCollectionState.weight !== null) {
                     nutritionInfoCollectionState.specificInstructions = cleanMessage;
                } else if (cleanMessage.length > 0 && !isNaN(parseFloat(cleanMessage)) && !heightMatch && !weightMatch){
                    // If user sends a number that wasn't captured as height/weight and we're waiting for instructions,
                    // it's likely still an instruction issue or malformed input. Don't process as instruction.
                    // This is to prevent a number from being taken as an instruction if a user just types a number by mistake.
                }
                 else {
                    nutritionInfoCollectionState.specificInstructions = cleanMessage;
                }
            }
        }


        // Check if all required nutrition info is gathered
        if (
          nutritionInfoCollectionState.height !== null &&
          nutritionInfoCollectionState.weight !== null &&
          nutritionInfoCollectionState.specificInstructions !== null
        ) {
          // All info collected, generate the personalized plan
          const bmi = calculateBMI(nutritionInfoCollectionState.weight, nutritionInfoCollectionState.height);
          const nutritionPrompt = `Act as a personalized nutrition and fitness expert. Based on the following user data, provide a specialized meal plan and a workout plan:\n\nHeight: ${nutritionInfoCollectionState.height} cm\nWeight: ${nutritionInfoCollectionState.weight} kg\nBMI: ${bmi}\nSpecific Instructions/Goals: ${nutritionInfoCollectionState.specificInstructions}\n\nPlease provide a structured plan including:\n1. A detailed 7-day meal plan with breakfast, lunch, dinner, and snacks, specifying approximate calories and macronutrients for each meal.\n2. A detailed 7-day workout plan, specifying exercises, sets, reps, and rest periods.\n3. Include a brief explanation of how this plan supports the user's goals.\n\nEnsure the language is encouraging and professional.`;

          messages.push({ role: "user", content: message }); // Add the user's final instruction message to history
          messages.push({ role: "user", content: nutritionPrompt }); // Add the constructed prompt to Gemini's history for context

          completion = await getChatCompletion(messages); // Get completion for the nutrition prompt
          botResponseHandled = true; // Mark that a response was generated by this block

          // Reset nutrition collection state
          nutritionInfoCollectionState = {
            active: false,
            height: null,
            weight: null,
            specificInstructions: null,
          };
        } else {
          // Not all info collected, ask for remaining details
          let promptResponse = "I need a bit more information to create your personalized plan. ";
          if (nutritionInfoCollectionState.height === null) {
            promptResponse += "Please tell me your height (e.g., 'my height is 170cm' or 'my height is 1.7 meters'). ";
          }
          if (nutritionInfoCollectionState.weight === null) {
            promptResponse += "And your weight (e.g., 'my weight is 70kg' or 'my weight is 150lbs'). ";
          }
          if (nutritionInfoCollectionState.specificInstructions === null) {
            promptResponse += "Finally, please state your specific instructions or goals (e.g., 'I want to gain muscle and prefer high protein meals').";
          }
          completion = { role: "model", content: promptResponse };
          botResponseHandled = true; // Mark that a response was generated by this block
        }
      } else if (message.toLowerCase().includes("nutrition plan") || message.toLowerCase().includes("meal plan") || message.toLowerCase().includes("workout plan")) {
        // Initial request for nutrition plan
        nutritionInfoCollectionState.active = true;
        completion = { role: "model", content: "Great! To create your personalized nutrition and workout plan, I need some information. Please tell me your height (e.g., 'my height is 170cm' or 'my height is 1.7 meters'), your weight (e.g., 'my weight is 70kg' or 'my weight is 150lbs'), and any specific instructions or goals you have (e.g., 'I want to lose weight and prefer vegetarian meals'). You can provide all details in one message or in separate messages." };
        botResponseHandled = true; // Mark that a response was generated by this block
      }

      // If a bot response was explicitly handled by the nutrition logic, use it
      if (botResponseHandled) {
        // Add the user's message to general history for display purposes
        // It's already pushed if coming from standard chat or final nutrition prompt
        if (!messages.find(msg => msg.content === message && msg.role === 'user')) {
             messages.push({ role: "user", content: message });
        }
        messages.push(completion); // Add bot's generated completion
        console.log("User:", message);
        console.log("Assistant:", completion.content);
        return res.send({ completion: completion.content });
      } else {
        // If not in nutrition flow or no specific response yet,
        // proceed with general chat using previous messages.
        messages.push({ role: "user", content: message });
        console.log("User:", message);

        completion = await getChatCompletion(messages);
        if (!completion) {
          return res.status(500).send({ message: "Something went wrong" });
        }

        messages.push(completion);
        console.log("Assistant:", completion.content);
        return res.send({ completion: completion.content });
      }

    } catch (error) {
      console.error("Server error:", error);
      res.status(500).send({ error: "Failed to process your request." });
    }
  }
});


app.post("/newSession", async (req, res) => {
  messages = [];
  nutritionInfoCollectionState = {
    active: false,
    height: null,
    weight: null,
    specificInstructions: null,
  };
  res.send({ message: "Session reset" });
});


// Note: Image generation is currently noted as not supported with Gemini in your setup.
// This function remains for context from your original file.
async function generateImage(prompt) {
  throw new Error("Image generation not supported with Gemini.");
}

async function getChatCompletion(messages) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        maxOutputTokens: 2000,
      },
    });

    const chat = model.startChat({
      history: messages.map(msg => ({
        // Map roles: 'user' remains 'user', but 'assistant' must become 'model' for Gemini
        role: msg.role === "assistant" ? "model" : msg.role,
        parts: [{ text: msg.content }],
      })),
    });

    // The last message in the history is the current user's message
    // If we're providing a generated prompt (like for nutrition plan), that's the one we send to Gemini.
    // Otherwise, it's the actual user message.
    const messageToSend = messages[messages.length - 1].content;
    const result = await chat.sendMessage(messageToSend);
    const response = result.response.text();

    // When returning the completion, ensure the role is "model" for Gemini's responses
    return { role: "model", content: response };
  } catch (err) {
    console.error("Gemini error:", err);
    return null;
  }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`));