import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface DeleteCaptchaProps {
  onValidationChange: (isValid: boolean) => void;
}

export default function DeleteCaptcha({ onValidationChange }: DeleteCaptchaProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isValid, setIsValid] = useState(false);

  const generateNewChallenge = () => {
    const newNum1 = Math.floor(Math.random() * 10) + 1;
    const newNum2 = Math.floor(Math.random() * 10) + 1;
    setNum1(newNum1);
    setNum2(newNum2);
    setUserAnswer('');
    setIsValid(false);
    onValidationChange(false);
  };

  useEffect(() => {
    generateNewChallenge();
  }, []);

  useEffect(() => {
    const correctAnswer = num1 + num2;
    const userAnswerNum = parseInt(userAnswer);
    const valid = userAnswerNum === correctAnswer;
    setIsValid(valid);
    onValidationChange(valid);
  }, [userAnswer, num1, num2]);

  const handleAnswerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setUserAnswer(value);
    }
  };

  return (
    <div style={{
      marginBottom: '16px',
      padding: '16px',
      backgroundColor: '#f0f9ff',
      border: '2px solid #3b82f6',
      borderRadius: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <label style={{ fontWeight: '600', fontSize: '14px', color: '#1e40af' }}>
          🔒 Security Check - Solve to Continue
        </label>
        <button
          type="button"
          onClick={generateNewChallenge}
          style={{
            padding: '6px 12px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Generate new challenge"
        >
          <RefreshCw size={14} />
          New
        </button>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '2px solid #93c5fd',
          fontFamily: 'monospace',
          fontSize: '24px',
          fontWeight: '700',
          color: '#1e40af',
          minWidth: '120px',
          textAlign: 'center'
        }}>
          {num1} + {num2} = ?
        </div>
        
        <input
          type="text"
          inputMode="numeric"
          value={userAnswer}
          onChange={handleAnswerChange}
          placeholder="Answer"
          style={{
            flex: 1,
            padding: '12px',
            border: `2px solid ${userAnswer && !isValid ? '#ef4444' : isValid ? '#22c55e' : '#e5e7eb'}`,
            borderRadius: '8px',
            fontSize: '18px',
            fontWeight: '600',
            textAlign: 'center',
            fontFamily: 'monospace',
            backgroundColor: userAnswer && !isValid ? '#fee2e2' : isValid ? '#d1fae5' : 'white'
          }}
          autoComplete="off"
        />
        
        <div style={{ width: '32px', display: 'flex', justifyContent: 'center' }}>
          {userAnswer && (
            isValid ? (
              <span style={{ fontSize: '24px' }}>✓</span>
            ) : (
              <span style={{ fontSize: '24px', color: '#ef4444' }}>✗</span>
            )
          )}
        </div>
      </div>
      
      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', marginBottom: 0 }}>
        Enter the correct answer to enable deletion
      </p>
    </div>
  );
}