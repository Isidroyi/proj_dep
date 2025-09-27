import React from 'react';
import { Status } from '../types';

interface ValueComparerProps {
  requirement: string;
  actualValue: string;
  status: Status;
}

const ValueComparer: React.FC<ValueComparerProps> = ({ requirement, actualValue, status }) => {
  let className = 'text-slate-300'; // Цвет по умолчанию

  if (status === Status.CONFORMS) {
    className = 'text-green-400 font-semibold';
  } else if (status === Status.DOES_NOT_CONFORM) {
    className = 'text-red-400 font-semibold';
  } else if (status === Status.PARTIAL_CONFORMANCE) {
    className = 'text-yellow-400 font-semibold';
  }
  
  // Компонент просто возвращает фактическое значение в span с нужным цветом
  return <span className={className}>{actualValue}</span>;
};

export default ValueComparer;