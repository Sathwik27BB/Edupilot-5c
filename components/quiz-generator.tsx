"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { ExportTools } from "@/components/export-tools"
import { usePilotPoints } from "@/hooks/use-pilot-points"
import { useAIRequest } from "@/hooks/use-ai-request"

interface QuizGeneratorProps {
  studyText: string
  onBack: () => void
}

interface QuizQuestion {
  question: string
  options: string[]
  correctAnswer: string
}

export function QuizGenerator({ studyText, onBack }: QuizGeneratorProps) {
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [isQuizCompleted, setIsQuizCompleted] = useState(false)
  const { addPoints } = usePilotPoints()

  const { isLoading, error, makeRequest } = useAIRequest({
    parseJson: true,
    timeout: 30000, // 30 second timeout
    onSuccess: (data) => {
      // Validate the structure
      if (
        !Array.isArray(data) ||
        !data.every((q) => q.question && Array.isArray(q.options) && q.options.length === 4 && q.correctAnswer)
      ) {
        console.error("Invalid quiz format:", data)
        return
      }

      setQuiz(data)
      setCurrentQuestionIndex(0)
      setSelectedOption(null)
      setIsAnswered(false)
      setScore(0)
      setIsQuizCompleted(false)

      // Add points for generating a quiz
      addPoints(20, "Generated a quiz")
    },
  })

  const generateQuiz = async () => {
    await makeRequest("quiz", studyText)
  }

  useEffect(() => {
    if (studyText.trim()) {
      generateQuiz()
    }

    // Cleanup function to cancel any pending requests when component unmounts
    return () => {
      // If we had a cancelRequest function exposed from the hook, we would call it here
    }
  }, [])

  const currentQuestion = quiz[currentQuestionIndex]

  const handleOptionSelect = (option: string) => {
    if (isAnswered) return
    setSelectedOption(option)
  }

  const checkAnswer = () => {
    if (!selectedOption || !currentQuestion) return

    setIsAnswered(true)

    if (selectedOption === currentQuestion.correctAnswer) {
      setScore(score + 1)
      // Add points for correct answer
      addPoints(5, "Correct quiz answer")
    }
  }

  const nextQuestion = () => {
    if (currentQuestionIndex < quiz.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedOption(null)
      setIsAnswered(false)
    } else {
      setIsQuizCompleted(true)
      // Add bonus points for completing the quiz
      const completionBonus = Math.round((score / quiz.length) * 50)
      addPoints(completionBonus, `Quiz completion bonus (${score}/${quiz.length})`)
    }
  }

  const restartQuiz = () => {
    setCurrentQuestionIndex(0)
    setSelectedOption(null)
    setIsAnswered(false)
    setScore(0)
    setIsQuizCompleted(false)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-lg font-medium">Generating quiz...</p>
        <p className="text-sm text-muted-foreground">This may take a moment</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>

        <Card className="border-destructive">
          <CardHeader className="bg-destructive/10">
            <CardTitle className="flex items-center text-destructive">
              <AlertCircle className="mr-2 h-5 w-5" />
              Error Generating Quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              This could be due to an API issue or connection problem. Please try again later.
            </p>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={onBack}>
              Back to Input
            </Button>
            <Button onClick={generateQuiz}>Try Again</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!currentQuestion && !isQuizCompleted && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-lg font-medium">No quiz questions available</p>
        <Button onClick={generateQuiz}>Generate Quiz</Button>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        {!isQuizCompleted && quiz.length > 0 ? (
          <div className="text-sm text-muted-foreground">
            Question {currentQuestionIndex + 1} of {quiz.length}
          </div>
        ) : null}

        {quiz.length > 0 && <ExportTools contentType="quiz" content={quiz} title="Study Quiz" />}
      </div>

      <AnimatePresence mode="wait">
        {!isQuizCompleted && currentQuestion ? (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Question {currentQuestionIndex + 1}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <p className="text-lg font-medium">{currentQuestion.question}</p>
                </div>

                <RadioGroup value={selectedOption || ""} className="space-y-3">
                  {currentQuestion.options.map((option) => (
                    <div
                      key={option}
                      className={cn(
                        "flex items-center space-x-2 rounded-md border p-3 transition-colors",
                        selectedOption === option && !isAnswered && "border-primary",
                        isAnswered && option === currentQuestion.correctAnswer && "border-green-500 bg-green-500/10",
                        isAnswered &&
                          selectedOption === option &&
                          option !== currentQuestion.correctAnswer &&
                          "border-red-500 bg-red-500/10",
                      )}
                      onClick={() => handleOptionSelect(option)}
                    >
                      <RadioGroupItem
                        value={option}
                        id={option}
                        disabled={isAnswered}
                        className={cn(
                          isAnswered && option === currentQuestion.correctAnswer && "text-green-500",
                          isAnswered &&
                            selectedOption === option &&
                            option !== currentQuestion.correctAnswer &&
                            "text-red-500",
                        )}
                      />
                      <Label
                        htmlFor={option}
                        className={cn(
                          "flex-1 cursor-pointer",
                          isAnswered && option === currentQuestion.correctAnswer && "text-green-500",
                          isAnswered &&
                            selectedOption === option &&
                            option !== currentQuestion.correctAnswer &&
                            "text-red-500",
                        )}
                      >
                        {option}
                      </Label>

                      {isAnswered && option === currentQuestion.correctAnswer && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}

                      {isAnswered && selectedOption === option && option !== currentQuestion.correctAnswer && (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
              <CardFooter className="flex justify-between">
                {!isAnswered ? (
                  <Button onClick={checkAnswer} disabled={!selectedOption}>
                    Check Answer
                  </Button>
                ) : (
                  <Button onClick={nextQuestion}>
                    {currentQuestionIndex < quiz.length - 1 ? (
                      <>
                        Next Question <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    ) : (
                      "See Results"
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </motion.div>
        ) : (
          isQuizCompleted && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Quiz Results</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <div className="mb-6 text-center">
                    <p className="text-2xl font-bold">
                      {score} / {quiz.length} correct
                    </p>
                    <p className="text-muted-foreground">{Math.round((score / quiz.length) * 100)}% accuracy</p>
                  </div>

                  <div className="relative h-40 w-40">
                    <svg className="h-full w-full" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        className="text-muted"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        strokeDasharray="283"
                        strokeDashoffset={283 - (283 * score) / quiz.length}
                        className="text-primary"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold">
                      {Math.round((score / quiz.length) * 100)}%
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-center gap-4">
                  <Button onClick={restartQuiz}>Restart Quiz</Button>
                  <Button variant="outline" onClick={generateQuiz}>
                    Generate New Quiz
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  )
}
