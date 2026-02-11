/**
 * Loading skeleton component for better perceived performance
 * Shows placeholder content while data is loading
 */
export function TableSkeleton() {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            height: '52px',
            backgroundColor: '#f3f4f6',
            borderRadius: '10px',
            marginBottom: '10px',
            animation: 'bl-shimmer 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`
          }} />
        ))}
        <style>{`
          @keyframes bl-shimmer {
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
        marginBottom: '10px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          height: '18px',
          backgroundColor: '#f3f4f6',
          borderRadius: '6px',
          marginBottom: '8px',
          width: '60%',
          animation: 'bl-shimmer 1.5s ease-in-out infinite'
        }} />
        <div style={{
          height: '14px',
          backgroundColor: '#f3f4f6',
          borderRadius: '6px',
          marginBottom: '8px',
          width: '80%',
          animation: 'bl-shimmer 1.5s ease-in-out infinite',
          animationDelay: '0.1s'
        }} />
        <div style={{
          height: '14px',
          backgroundColor: '#f3f4f6',
          borderRadius: '6px',
          width: '40%',
          animation: 'bl-shimmer 1.5s ease-in-out infinite',
          animationDelay: '0.2s'
        }} />
        <style>{`
          @keyframes bl-shimmer {
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
          <div key={i} style={{ marginBottom: '18px' }}>
            <div style={{
              height: '12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              marginBottom: '8px',
              width: '30%',
              animation: 'bl-shimmer 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`
            }} />
            <div style={{
              height: '40px',
              backgroundColor: '#f3f4f6',
              borderRadius: '10px',
              animation: 'bl-shimmer 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1 + 0.05}s`
            }} />
          </div>
        ))}
        <style>{`
          @keyframes bl-shimmer {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }
