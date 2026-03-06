import CANONICAL_VALUES from '../shared/wizard-canonical-values.json' assert { type: 'json' };

const formatLabel = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export const WIZARD_CANONICAL = CANONICAL_VALUES;

export const HOBBY_OPTIONS = [
    { val: 'cycling', label: '🚴 Rower' },
    { val: 'running', label: '🏃 Bieganie' },
    { val: 'swimming', label: '🏊 Pływanie' },
    { val: 'gym', label: '🏋️ Siłownia' },
    { val: 'yoga', label: '🧘 Joga' },
    { val: 'walking', label: '🚶 Spacery' },
    { val: 'none', label: '❌ Brak' }
].filter(opt => WIZARD_CANONICAL.hobby.includes(opt.val));

export const MEDICAL_DIAGNOSIS_OPTIONS = [
    { val: 'scoliosis', label: 'Skolioza' },
    { val: 'disc_herniation', label: 'Dyskopatia / Przepuklina' },
    { val: 'stenosis', label: 'Stenoza kanału' },
    { val: 'facet_syndrome', label: 'Stawy międzykręgowe' },
    { val: 'piriformis', label: 'Mięsień gruszkowaty' },
    { val: 'chondromalacia', label: '🦴 Chondromalacja / Rzepka' },
    { val: 'meniscus_tear', label: '🩹 Uszkodzenie łąkotki' },
    { val: 'acl_rehab', label: '🦵 ACL / Więzadła' },
    { val: 'jumpers_knee', label: '🏀 Kolano skoczka' },
    { val: 'none', label: 'Brak rozpoznania / Inne' }
].filter(opt => WIZARD_CANONICAL.medical_diagnosis.includes(opt.val));

export const RESTRICTION_OPTIONS = [
    { val: 'foot_injury', label: '🦶 Uraz stopy (bez obciążania)' },
    { val: 'no_kneeling', label: '🚫 Nie mogę klęczeć' },
    { val: 'no_deep_squat', label: '🚫 Zakaz głębokich przysiadów' },
    { val: 'no_floor_sitting', label: 'Nie usiądę na podłodze' },
    { val: 'no_twisting', label: 'Ból przy skrętach' },
    { val: 'no_high_impact', label: 'Zakaz skoków' },
    { val: 'none', label: 'Brak' }
].filter(opt => WIZARD_CANONICAL.physical_restrictions.includes(opt.val));

export const defaultEquipmentLabel = formatLabel;
