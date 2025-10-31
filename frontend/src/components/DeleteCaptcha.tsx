import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ShieldCheck, Calculator } from 'lucide-react';
import { useTranslation } from '../i18n';

interface DeleteCaptchaProps {
  onValidationChange: (isValid: boolean) => void;
}

interface MathQuestion {
  question: string;
  correctAnswer: number;
  options: number[];
}

export default function DeleteCaptcha({ onValidationChange }: DeleteCaptchaProps) {
  const { t } = useTranslation();
  const [mathQuestion, setMathQuestion] = useState<MathQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);

  const generateMathQuestion = useCallback((): MathQuestion => {
    const operations = [
      { type: 'add', symbol: '+', fn: (a: number, b: number) => a + b },
      { type: 'subtract', symbol: '-', fn: (a: number, b: number) => a - b },
      { type: 'multiply', symbol: '×', fn: (a: number, b: number) => a * b }
    ];

    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let num1: number, num2: number, correctAnswer: number;
    
    if (operation.type === 'multiply') {
      // Keep multiplication simple (1-10)
      num1 = Math.floor(Math.random() * 10) + 1;
      num2 = Math.floor(Math.random() * 10) + 1;
    } else if (operation.type === 'subtract') {
      // Ensure positive result
      num1 = Math.floor(Math.random() * 20) + 10;
      num2 = Math.floor(Math.random() * num1) + 1;
    } else {
      // Addition
      num1 = Math.floor(Math.random() * 20) + 1;
      num2 = Math.floor(Math.random() * 20) + 1;
    }

    correctAnswer = operation.fn(num1, num2);
    
    // Generate wrong answers
    const wrongAnswers = new Set<number>();
    while (wrongAnswers.size < 2) {
      const offset = Math.floor(Math.random() * 10) - 5;
      const wrongAnswer = correctAnswer + offset;
      if (wrongAnswer !== correctAnswer && wrongAnswer > 0) {
        wrongAnswers.add(wrongAnswer);
      }
    }

    // Shuffle options
    const options = [correctAnswer, ...Array.from(wrongAnswers)];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return {
      question: `${num1} ${operation.symbol} ${num2}`,
      correctAnswer,
      options
    };
  }, []);

  const generateNewChallenge = useCallback(() => {
    const newQuestion = generateMathQuestion();
    setMathQuestion(newQuestion);
    setSelectedAnswer(null);
    setIsValid(false);
    setHasAnswered(false);
    onValidationChange(false);
  }, [generateMathQuestion, onValidationChange]);

  useEffect(() => {
    generateNewChallenge();
  }, [generateNewChallenge]);

  const handleAnswerSelect = (answer: number) => {
    setSelectedAnswer(answer);
    setHasAnswered(true);
    
    const correct = mathQuestion && answer === mathQuestion.correctAnswer;
    setIsValid(correct);
    onValidationChange(correct);
  };

  const getButtonStyle = (answer: number) => {
    const baseStyle = {
      padding: '16px 24px',
      fontSize: '18px',
      fontWeight: '700' as const,
      border: '2px solid',
      borderRadius: '12px',
      cursor: isValid ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      minWidth: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
    };

    if (!hasAnswered) {
      return {
        ...baseStyle,
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        color: '#1e293b'
      };
    }

    if (answer === mathQuestion?.correctAnswer) {
      return {
        ...baseStyle,
        backgroundColor: '#22c55e',
        borderColor: '#16a34a',
        color: '#ffffff',
        boxShadow: '0 4px 8px rgba(34, 197, 94, 0.3)'
      };
    }

    if (answer === selectedAnswer) {
      return {
        ...baseStyle,
        backgroundColor: '#ef4444',
        borderColor: '#dc2626',
        color: '#ffffff',
        boxShadow: '0 4px 8px rgba(239, 68, 68, 0.3)'
      };
    }

    return {
      ...baseStyle,
      backgroundColor: '#f1f5f9',
      borderColor: '#cbd5e1',
      color: '#64748b',
      opacity: 0.5
    };
  };

  if (!mathQuestion) return null;

  return (
    <div style={{
      marginBottom: '16px',
      padding: '20px',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      border: '2px solid #3b82f6',
      borderRadius: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isValid ? (
            <ShieldCheck size={20} color="#22c55e" />
          ) : (
            <Calculator size={20} color="#3b82f6" />
          )}
          <label style={{ 
            fontWeight: '700', 
            fontSize: '15px', 
            color: isValid ? '#16a34a' : '#1e40af'
          }}>
            {t('captcha.title')}
          </label>
        </div>
        <button
          type="button"
          onClick={generateNewChallenge}
          disabled={isValid}
          style={{
            padding: '8px 14px',
            background: isValid ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: isValid ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            boxShadow: isValid ? 'none' : '0 2px 4px rgba(59, 130, 246, 0.3)',
            opacity: isValid ? 0.5 : 1
          }}
          title={t('captcha.refreshTitle')}
        >
          <RefreshCw size={14} />
          {t('captcha.new')}
        </button>
      </div>

      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <p style={{ 
          fontSize: '14px', 
          color: '#1e40af', 
          marginBottom: '16px', 
          fontWeight: '600'
        }}>
          {t('captcha.mathInstruction')}
        </p>
        
        <div style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '20px',
          border: '2px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            fontSize: '36px',
            fontWeight: '700',
            color: '#1e293b',
            fontFamily: 'monospace',
            letterSpacing: '2px'
          }}>
            {mathQuestion.question} = ?
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {mathQuestion.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => !isValid && handleAnswerSelect(option)}
              disabled={isValid}
              style={getButtonStyle(option)}
              onMouseEnter={(e) => {
                if (!hasAnswered && !isValid) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }
              }}
              onMouseLeave={(e) => {
                if (!hasAnswered && !isValid) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }
              }}
            >
              {option}
              {hasAnswered && option === mathQuestion.correctAnswer && (
                <span style={{ marginLeft: '8px' }}>✓</span>
              )}
              {hasAnswered && option === selectedAnswer && option !== mathQuestion.correctAnswer && (
                <span style={{ marginLeft: '8px' }}>✗</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: 0, fontWeight: '500' }}>
          {t('captcha.mathFooter')}
        </p>
        {isValid && (
          <span style={{ 
            fontSize: '13px', 
            color: '#22c55e', 
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            ✓ {t('captcha.success')}
          </span>
        )}
        {hasAnswered && !isValid && (
          <span style={{ 
            fontSize: '13px', 
            color: '#ef4444', 
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            ✗ {t('captcha.tryAgain')}
          </span>
        )}
      </div>
    </div>
  );
}