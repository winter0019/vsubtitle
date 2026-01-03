
import React from 'react';

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  isCompleted: boolean;
  isActive: boolean;
  children?: React.ReactNode;
}

const StepCard: React.FC<StepCardProps> = ({ number, title, description, isCompleted, isActive, children }) => {
  return (
    <div className={`glass-card p-6 rounded-2xl transition-all duration-300 ${isActive ? 'ring-2 ring-sky-500 scale-[1.02]' : 'opacity-70'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold ${isCompleted ? 'bg-green-500' : 'bg-sky-500'}`}>
          {isCompleted ? <i className="fas fa-check"></i> : number}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold mb-1">{title}</h3>
          <p className="text-slate-400 text-sm mb-4">{description}</p>
          {isActive && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-4 duration-500">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepCard;
