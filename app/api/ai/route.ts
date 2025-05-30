import { type NextRequest, NextResponse } from "next/server"

// Updated OpenRouter API key
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "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"
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

// Cache for storing recent responses to avoid duplicate API calls
const responseCache = new Map()
const CACHE_TTL = 1000 * 60 * 10 // 10 minutes

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map()

export async function POST(req: NextRequest) {
  try {
    const { prompt, task, content } = await req.json()

    // Create a cache key based on the request parameters
    const cacheKey = `${task}:${content?.slice(0, 100)}:${prompt?.slice(0, 50)}`

    // Check if we have a cached response
    const cachedResponse = responseCache.get(cacheKey)
    if (cachedResponse && Date.now() - cachedResponse.timestamp < CACHE_TTL) {
      console.log("Using cached response for:", task)
      return NextResponse.json(cachedResponse.data)
    }

    // Check if there's an ongoing request for the same query
    if (ongoingRequests.has(cacheKey)) {
      try {
        // Wait for the ongoing request to complete
        console.log("Waiting for ongoing request to complete for:", task)
        const result = await ongoingRequests.get(cacheKey)
        return NextResponse.json(result)
      } catch (error) {
        // If the ongoing request fails, we'll proceed with a new request
        console.log("Ongoing request failed, creating new request for:", task)
      }
    }

    // Create a promise for this request that can be awaited by duplicate requests
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        // Select the appropriate model based on the task
        let model = "meta-llama/llama-4-scout:free" // default model

        // For complex reasoning tasks, use deepseek
        if (task === "mindmap" || task === "quiz") {
          model = "deepseek/deepseek-r1-distill-qwen-32b:free"
        }

        // Construct the system prompt based on the task
        let systemPrompt = ""
        let userPrompt = ""
        let temperature = 0.7
        let maxTokens = 1024

        switch (task) {
          case "summarize":
            systemPrompt =
              "You are an AI study assistant that creates concise, informative summaries of educational content. Focus on key concepts, main ideas, and important details. Format your response with clear headings, bullet points for key facts, and a brief conclusion."
            userPrompt = `Please summarize the following text in a clear, structured format with headings and bullet points for key concepts:\n\n${content}`
            temperature = 0.3 // Lower temperature for more factual output
            break

          case "quiz":
            systemPrompt =
              "You are an AI study assistant that creates educational quiz questions. Generate challenging but fair multiple-choice questions based on the provided content. Each question should have 4 options with exactly one correct answer. IMPORTANT: Return ONLY the raw JSON array without any markdown formatting, code blocks, or explanation. The response should be directly parseable by JSON.parse()."
            userPrompt = `Create 5 multiple-choice quiz questions based on this content. Return ONLY a JSON array with objects containing 'question', 'options' (array of 4 choices), and 'correctAnswer' fields. Do not include any explanation, markdown formatting, or code blocks in your response. The response must be valid JSON that can be directly parsed:\n\n${content}`
            temperature = 0.7 // Higher temperature for more creative questions
            maxTokens = 1500
            break

          case "askdoubt":
            systemPrompt =
              "You are an AI tutor that answers student questions clearly and accurately. Provide detailed explanations with examples when helpful."
            userPrompt = `The student is studying the following content and has this question: "${prompt}"\n\nContent: ${content}\n\nProvide a helpful, educational answer.`
            temperature = 0.4
            break

          case "mindmap":
            systemPrompt =
              "You are an AI study assistant that creates mind maps. Extract key concepts and their relationships from educational content. IMPORTANT: Return ONLY the raw JSON object without any markdown formatting, code blocks, or explanation. The response should be directly parseable by JSON.parse()."
            userPrompt = `Create a mind map based on this content. Return ONLY a JSON object with a 'center' field (main topic) and a 'nodes' array. Each node should have 'id', 'text', 'position' (as an array [x,y,z] with 3 numeric values), and optionally 'children' (an array with the same structure). Do not include any explanation, markdown formatting, or code blocks in your response. The response must be valid JSON that can be directly parsed:\n\n${content}`
            temperature = 0.7
            maxTokens = 2000
            break

          case "flashcards":
            systemPrompt =
              "You are an AI study assistant that creates effective flashcards for learning. Extract key concepts and definitions from educational content. IMPORTANT: Return ONLY the raw JSON array without any markdown formatting, code blocks, or explanation. The response should be directly parseable by JSON.parse()."
            userPrompt = `Create 5-10 flashcards based on this content. Return ONLY a JSON array with objects containing 'id', 'question', and 'answer' fields. Do not include any explanation, markdown formatting, or code blocks in your response. The response must be valid JSON that can be directly parsed:\n\n${content}`
            temperature = 0.5
            maxTokens = 1500
            break

          default:
            reject({ error: "Invalid task type" })
            return
        }

        console.log(`Making OpenRouter API request for task: ${task}`)

        // Implement exponential backoff for API requests
        const maxRetries = 3
        let retryCount = 0
        let response = null

        while (retryCount < maxRetries) {
          try {
            // Make request to OpenRouter API with proper authentication
            response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://edupilot-design.vercel.app",
                "X-Title": "EduPilot AI Study Assistant",
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  {
                    role: "system",
                    content: systemPrompt,
                  },
                  {
                    role: "user",
                    content: userPrompt,
                  },
                ],
                temperature: temperature,
                max_tokens: maxTokens,
                // Add streaming for faster initial response
                stream: false,
              }),
              // Set a timeout for the fetch request
              signal: AbortSignal.timeout(15000), // 15 second timeout
            })

            if (response.ok) {
              break
            } else {
              const errorData = await response.json()
              console.error(`OpenRouter API error (attempt ${retryCount + 1}):`, errorData)

              // If we get a rate limit error, wait and retry
              if (response.status === 429) {
                const backoffTime = Math.pow(2, retryCount) * 1000
                await new Promise((resolve) => setTimeout(resolve, backoffTime))
                retryCount++
              } else {
                // For other errors, don't retry
                reject({
                  error: "Failed to get response from AI",
                  details: errorData,
                  status: response.status,
                })
                return
              }
            }
          } catch (error) {
            console.error(`API request error (attempt ${retryCount + 1}):`, error)
            retryCount++

            if (retryCount >= maxRetries) {
              reject({
                error: "Network error after multiple retries",
                details: error instanceof Error ? error.message : String(error),
              })
              return
            }

            // Wait before retrying
            const backoffTime = Math.pow(2, retryCount) * 1000
            await new Promise((resolve) => setTimeout(resolve, backoffTime))
          }
        }

        if (!response || !response.ok) {
          reject({ error: "Failed to get response from AI after multiple attempts" })
          return
        }

        const data = await response.json()
        const result = { result: data.choices[0].message.content }

        // Cache the successful response
        responseCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        })

        resolve(result)
      } catch (error) {
        console.error("API route error:", error)
        reject({
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        })
      } finally {
        // Remove from ongoing requests
        ongoingRequests.delete(cacheKey)
      }
    })

    // Store the promise in the ongoing requests map
    ongoingRequests.set(cacheKey, requestPromise)

    // Wait for the request to complete
    const result = await requestPromise
    return NextResponse.json(result)
  } catch (error) {
    console.error("API route error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
