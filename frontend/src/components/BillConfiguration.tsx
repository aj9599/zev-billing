import BillConfigModal from './billing/components/configuration/BillConfigModal';

interface BillConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
}

export default function BillConfiguration({
  isOpen,
  onClose,
  onGenerate
}: BillConfigurationProps) {
  return (
    <BillConfigModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onGenerate}
    />
  );
}