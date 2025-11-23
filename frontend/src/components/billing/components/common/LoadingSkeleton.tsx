/**
 * Loading skeleton component for better perceived performance
 * Shows placeholder content while data is loading
 */
export function TableSkeleton() {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        padding: '16px',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            height: '60px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            marginBottom: '12px'
          }} />
        ))}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }
  
  /**
   * Card skeleton for mobile view
   */
  export function CardSkeleton() {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}>
        <div style={{
          height: '20px',
          backgroundColor: '#f3f4f6',
          borderRadius: '4px',
          marginBottom: '8px',
          width: '60%'
        }} />
        <div style={{
          height: '16px',
          backgroundColor: '#f3f4f6',
          borderRadius: '4px',
          marginBottom: '8px',
          width: '80%'
        }} />
        <div style={{
          height: '16px',
          backgroundColor: '#f3f4f6',
          borderRadius: '4px',
          width: '40%'
        }} />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }
  
  /**
   * Form skeleton for modals
   */
  export function FormSkeleton() {
    return (
      <div style={{ padding: '20px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            <div style={{
              height: '14px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              marginBottom: '8px',
              width: '30%',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            <div style={{
              height: '40px',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          </div>
        ))}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }