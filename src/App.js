/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/anchor-has-content */
import React, { useRef, useEffect, useState } from "react";
import Modal from "react-modal";
import DefaultPage from "./components/Default";
Modal.setAppElement("#root");

// MarkdownTableRenderer Component for displaying Gemini's tabular output
const MarkdownTableRenderer = ({ markdown }) => {
  const parseMarkdownTable = (markdownString) => {
    const lines = markdownString.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) return null; // Needs at least header and separator

    const headerLine = lines[0];
    const separatorLine = lines[1];

    // Basic check for markdown table separator (e.g., ---|---)
    if (!separatorLine.includes('---')) {
      return null; // Not a valid markdown table
    }

    // Split headers and trim
    const headers = headerLine.split('|').map(h => h.trim()).filter(h => h.length > 0);
    const rows = [];

    // Parse data rows
    for (let i = 2; i < lines.length; i++) {
      const rowData = lines[i].split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
      if (rowData.length === headers.length) {
        rows.push(rowData);
      } else {
          // If a line doesn't match the column count, it might be the end of the table or a malformed row.
          break; // Stop parsing this table
      }
    }
    if (headers.length === 0 || rows.length === 0) return null; // Ensure we have headers and at least one row
    return { headers, rows };
  };

  const tableData = parseMarkdownTable(markdown);

  if (!tableData) {
    return (
      // If it's not a parseable table, render as preformatted text
      <pre className="markdown-plain-text"><span>{markdown}</span></pre>
    );
  }

  return (
    <table className="markdown-table">
      <thead>
        <tr>
          {tableData.headers.map((header, index) => (
            <th key={index}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableData.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};


function App() {
  const [value, setValue] = useState("");
  const [modalValue, setModalValue] = useState("");
  const [message, setMessage] = useState(null);
  const [previousChats, setPreviousChats] = useState([]);
  const [currentTitle, setCurrentTitle] = useState("");
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isDeletePromptOpen, setIsDeletePromptOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking] = useState(false); // Assuming this is managed elsewhere or not actively used for speaking
  const chatFeedRef = useRef(null);
  const [isDefaultPage, setIsDefaultPage] = useState(true); // Track if the default page should be shown
  const [theme, setTheme] = useState("default");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const silenceTimeoutRef = useRef(null); // Keep this for existing silence logic

  // New state for Nutrition Modal
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [nutritionHeight, setNutritionHeight] = useState('');
  const [nutritionWeight, setNutritionWeight] = useState('');
  const [nutritionInstructions, setNutritionInstructions] = useState('');


  const toggleMenu = () => {
    setIsActive(!isActive);
  };
  const handleThemeChange = (selectedTheme) => {
    setTheme(selectedTheme);
    setIsThemeMenuOpen(false);
  };

  const createNewChat = () => {
    setMessage(null);
    setValue("");
    setCurrentTitle("");
    setIsDefaultPage(true); // Show default page for new chat
    fetch("http://localhost:8000/newSession", { method: "POST" })
      .then((res) => res.json())
      .then((data) => console.log(data.message))
      .catch((err) => console.error("Error resetting session:", err));
  };

  const handleClick = (uniqueTitle) => {
    setCurrentTitle(uniqueTitle);
    setMessage(null);
    setValue("");
    setIsDefaultPage(false); // Hide default page when a chat is selected
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      getMessages();
    }
  };

  const getMessages = async () => {
    if (!value) return;

    // Check for nutrition plan intent to open modal instead of sending to backend directly
    if (value.toLowerCase().includes("nutrition plan") || value.toLowerCase().includes("meal plan") || value.toLowerCase().includes("workout plan")) {
      setIsNutritionModalOpen(true); // Open the modal
      setValue(""); // Clear the input field
      setIsDefaultPage(false); // Move away from default page
      return; // Stop here, don't send to /completions yet
    }

    setIsLoading(true);

    // Clear the silence timeout when sending the message
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    const options = {
      method: "POST",
      body: JSON.stringify({
        message: value,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };

    try {
      const response = await fetch("http://localhost:8000/completions", options);
      const data = await response.json();

      if (data.image) {
        setMessage({
          title: currentTitle,
          role: "assistant",
          content: "",
          image: data.image,
        });
      } else {
        setMessage({
          title: currentTitle,
          role: "assistant",
          content: data.completion,
        });
      }

      setPreviousChats((prevChats) => [
        ...prevChats,
        {
          title: currentTitle,
          role: "user",
          content: value,
        },
      ]);

      setValue("");
      // if (isSpeaking) stopSpeaking(); // Assuming stopSpeaking function exists elsewhere
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Functions for Nutrition Modal
  const handleOpenNutritionModal = () => {
    setIsNutritionModalOpen(true);
    setNutritionHeight('');
    setNutritionWeight('');
    setNutritionInstructions('');
  };

  const handleCloseNutritionModal = () => {
    setIsNutritionModalOpen(false);
  };

  const handleSubmitNutrition = async () => {
    if (!nutritionHeight || !nutritionWeight || !nutritionInstructions) {
      setIsAlertOpen(true); // Re-use alert for missing info
      setModalValue("Please fill in all fields (Height, Weight, and Instructions).");
      return;
    }

    setIsLoading(true);
    handleCloseNutritionModal(); // Close modal immediately

    const options = {
      method: "POST",
      body: JSON.stringify({
        height: parseFloat(nutritionHeight),
        weight: parseFloat(nutritionWeight),
        instructions: nutritionInstructions,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };

    try {
      const response = await fetch("http://localhost:8000/generate-nutrition-plan", options);
      const data = await response.json();

      if (data.error) {
        setMessage({
          title: currentTitle,
          role: "assistant",
          content: `Error: ${data.error}`,
        });
      } else {
        setMessage({
          title: currentTitle,
          role: "assistant",
          content: data.completion,
        });
      }
      // Add a user entry to chat history representing the request from the modal
      setPreviousChats((prevChats) => [
        ...prevChats,
        {
          title: currentTitle,
          role: "user",
          content: `Requested nutrition plan (Height: ${nutritionHeight}cm, Weight: ${nutritionWeight}kg, Goals: ${nutritionInstructions}).`,
        },
      ]);

    } catch (error) {
      console.error("Nutrition plan generation error:", error);
      setMessage({
        title: currentTitle,
        role: "assistant",
        content: "Failed to generate your nutrition plan. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    if (!currentTitle && message && message.content) {
      setCurrentTitle(message.content.substring(0, 16));
    }
    if (message) {
      setPreviousChats((prevChats) => [
        ...prevChats,
        {
          title: currentTitle,
          role: message.role,
          content: message.content,
          image: message.image,
        },
      ]);
    }
  }, [message, currentTitle]);

  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [previousChats]);

  const currentChat = previousChats.filter(
    (chat) => chat.title === currentTitle
  );
  const uniqueTitles = Array.from(
    new Set(previousChats.map((chat) => chat.title))
  );

  const handleRenameClick = () => {
    setModalValue(currentTitle);
    setIsPromptOpen(true);
  };

  const handlePromptSubmit = () => {
    if (modalValue.length > 16) {
      setIsAlertOpen(true);
      setModalValue("The chat name is too big. Please try a shorter one. The limit is up to 16 characters.");
      return;
    }
    const updatedChats = previousChats.map((chat) =>
      chat.title === currentTitle ? { ...chat, title: modalValue } : chat
    );
    setPreviousChats(updatedChats);
    setCurrentTitle(modalValue);
    setIsPromptOpen(false);
  };

  const handlePromptClose = () => {
    setIsPromptOpen(false);
  };

  const handleDeleteClick = () => {
    setIsDeletePromptOpen(true);
  };

  const handleDeleteConfirm = () => {
    const updatedChats = previousChats.filter(
      (chat) => chat.title !== currentTitle
    );
    setPreviousChats(updatedChats);
    setCurrentTitle("");
    setIsDefaultPage(true);
    setIsDeletePromptOpen(false);
  };

  const handleDeletePromptClose = () => {
    setIsDeletePromptOpen(false);
  };

  const handleAlertClose = () => {
    setIsAlertOpen(false);
  };

  return (
    <div className={`app ${theme}`}>
      <aside className={isActive ? "active" : ""}>
        <div className="side-bar">
          <button className="new-chat-button" onClick={createNewChat}>
            + New Chat
          </button>
          <div className="history">
            {uniqueTitles?.map((uniqueTitle, index) => (
              <p key={index} onClick={() => handleClick(uniqueTitle)}>
                {uniqueTitle}
              </p>
            ))}
          </div>
          <nav>
            <p className="made-by">Made by Ankit</p>
            <div className="circular-menu" onClick={toggleMenu}>
              <div className="menu-button"></div>
              <ul className="items-wrapper">
                <li className="menu-item" onClick={handleRenameClick}>
                  Rename Chat
                </li>
                <li className="menu-item" onClick={handleDeleteClick}>
                  Delete Chat
                </li>
              </ul>
            </div>
            <div className="theme-switcher">
              <button
                className="theme-button"
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              >
                Theme
              </button>
              {isThemeMenuOpen && (
                <div className="theme-options">
                  <button onClick={() => handleThemeChange("default")}>
                    Default
                  </button>
                  <button onClick={() => handleThemeChange("light")}>
                    Light
                  </button>
                  <button onClick={() => handleThemeChange("dark")}>
                    Dark
                  </button>
                  <button onClick={() => handleThemeChange("solarized")}>
                    Solarized
                  </button>
                  <button onClick={() => handleThemeChange("nord")}>
                    Nord
                  </button>
                  <button onClick={() => handleThemeChange("dracula")}>
                    Dracula
                  </button>
                  <button onClick={() => handleThemeChange("gruvbox")}>
                    Gruvbox
                  </button>
                  <button onClick={() => handleThemeChange("oceanic")}>
                    Oceanic
                  </button>
                  <button onClick={() => handleThemeChange("purple")}>
                    Purple
                  </button>
                  <button onClick={() => handleThemeChange("high-contrast")}>
                    High Contrast
                  </button>
                  <button onClick={() => handleThemeChange("mono")}>
                    Mono
                  </button>
                  <button onClick={() => handleThemeChange("warm")}>
                    Warm
                  </button>
                  <button onClick={() => handleThemeChange("cold")}>
                    Cold
                  </button>
                  <button onClick={() => handleThemeChange("forest")}>
                    Forest
                  </button>
                  <button onClick={() => handleThemeChange("rose")}>
                    Rose
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </aside>
      <main>
        {isDefaultPage && <DefaultPage />}
        {!isDefaultPage && (
          <div className="chat-feed" ref={chatFeedRef}>
            <ul className="feed">
              {currentChat.map((chatMessage, index) => (
                <li key={index}>
                  <div className="message-container">
                    {chatMessage && (
                      <div className="role-container">
                        <p className="role">{chatMessage.role}</p>
                        {/* You can re-add speech synthesis button here if needed */}
                      </div>
                    )}
                    {chatMessage && chatMessage.image ? (
                      <img
                        className="generated-image"
                        src={chatMessage.image}
                        alt="Generated"
                      />
                    ) : (
                      chatMessage &&
                      chatMessage.content && (
                        // Render content, checking for markdown tables
                        <>
                          {chatMessage.content.split('\n\n').map((block, blockIndex) => {
                              // If block contains potential table markers, try rendering as table
                              if (block.includes('|') && block.includes('---')) {
                                  return <MarkdownTableRenderer key={blockIndex} markdown={block} />;
                              } else {
                                  // Otherwise, render as regular preformatted text
                                  return <pre key={blockIndex}><span>{block}</span></pre>;
                              }
                          })}
                        </>
                      )
                    )}
                  </div>
                </li>
              ))}
              <div ref={chatFeedRef} /> {/* Scroll to bottom ref */}
            </ul>
          </div>
        )}
        <div className="input-container">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            placeholder={isLoading ? "Generating..." : "Type your message here..."}
          />
          <div id="submit-button" onClick={getMessages}>
            ➢
          </div>
        </div>
      </main>

      {/* Nutrition Plan Input Modal */}
      <Modal
        isOpen={isNutritionModalOpen}
        onRequestClose={handleCloseNutritionModal}
        className="custom-modal"
        overlayClassName="custom-modal-overlay"
      >
        <h2>Personalized Plan Details</h2>
        <div>
          <label>Height (cm):</label>
          <input
            type="number"
            value={nutritionHeight}
            onChange={(e) => setNutritionHeight(e.target.value)}
            placeholder="e.g., 175"
          />
        </div>
        <div>
          <label>Weight (kg):</label>
          <input
            type="number"
            value={nutritionWeight}
            onChange={(e) => setNutritionWeight(e.target.value)}
            placeholder="e.g., 70"
          />
        </div>
        <div>
          <label>Specific Goals/Instructions:</label>
          <textarea
            value={nutritionInstructions}
            onChange={(e) => setNutritionInstructions(e.target.value)}
            placeholder="e.g., I want to gain muscle, no dairy, prefer vegetarian meals."
            rows="4"
          />
        </div>
        <div className="modal-buttons">
          <button onClick={handleSubmitNutrition} disabled={isLoading}>Generate Plan</button>
          <button onClick={handleCloseNutritionModal}>Cancel</button>
        </div>
      </Modal>

      {/* Existing Modals for rename, delete, alert */}
      <Modal
        isOpen={isPromptOpen}
        onRequestClose={handlePromptClose}
        className="custom-modal"
        overlayClassName="custom-modal-overlay"
      >
        <h2>Enter New Title</h2>
        <input
          type="text"
          value={modalValue}
          onChange={(e) => setModalValue(e.target.value)}
          onKeyPress={handleKeyPress} // Consider if this should trigger renaming on Enter
        />
        <div className="modal-buttons">
          <button onClick={handlePromptSubmit}>Rename</button>
          <button onClick={handlePromptClose}>Cancel</button>
        </div>
      </Modal>
      <Modal
        isOpen={isDeletePromptOpen}
        onRequestClose={handleDeletePromptClose}
        className="custom-modal"
        overlayClassName="custom-modal-overlay"
      >
        <h2>Are you sure?</h2>
        <p className="delete-prompt">Do you want to delete this chat?</p>
        <div className="modal-buttons">
          <button onClick={handleDeleteConfirm}>Yes</button>
          <button onClick={handleDeletePromptClose}>No</button>
        </div>
      </Modal>
      <Modal
        isOpen={isAlertOpen}
        onRequestClose={handleAlertClose}
        className="custom-modal"
        overlayClassName="custom-modal-overlay"
      >
        <div className="alert">
          <h2>Alert</h2>
          <p>{modalValue}</p> {/* Use modalValue for alert message */}
          <button onClick={handleAlertClose}>OK</button>
        </div>
      </Modal>
    </div>
  );
}

export default App;