import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);
async function getChatCompletion(messages) {
  try {
    const modelResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "what is python" }],
    });
    console.log(modelResponse.data.choices[0].message, " here");
    return modelResponse.data.choices[0].message;
  } catch (e) {
    console.error(e);
    return null;
  }
}

getChatCompletion();
