const CANONICAL_VALUES = {
    pain_locations: ['neck', 'cervical', 'thoracic', 'low_back', 'lumbar_general', 'lumbar', 'si_joint', 'hip', 'sciatica', 'knee', 'ankle', 'shoulder'],
    focus_locations: ['neck', 'thoracic', 'low_back', 'hip', 'knee', 'core', 'glute', 'full_body', 'metabolic', 'sleep', 'office'],
    medical_diagnosis: ['scoliosis', 'disc_herniation', 'stenosis', 'facet_syndrome', 'piriformis', 'chondromalacia', 'meniscus_tear', 'acl_rehab', 'jumpers_knee', 'none'],
    physical_restrictions: ['foot_injury', 'no_kneeling', 'no_deep_squat', 'no_floor_sitting', 'no_twisting', 'no_high_impact', 'none'],
    hobby: ['cycling', 'running', 'swimming', 'gym', 'yoga', 'walking', 'none'],
    focus: ['mobility', 'stability', 'strength', 'conditioning', 'breathing'],
    equipment: {
        ignorable: ['none', 'brak', '', 'brak sprzętu', 'masa własna', 'bodyweight'],
        aliases: {
            mata: 'mata',
            mat: 'mata'
        }
    }
};

export default CANONICAL_VALUES;
